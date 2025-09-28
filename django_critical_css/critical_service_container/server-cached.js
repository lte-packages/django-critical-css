import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { chromium } from 'playwright'
import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)
const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(helmet())
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Global browser instance for reuse
let browser = null

// Cache configurations
const CSS_CACHE_DIR = '/tmp/css-cache'
const MEMORY_CACHE = new Map()
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000 // 24 hours in milliseconds
const MAX_MEMORY_CACHE_SIZE = 100 // Maximum number of CSS files to keep in memory
const MAX_FILE_CACHE_SIZE_MB = 100 // Maximum total size of file cache in MB

// Cache statistics
let cacheStats = {
  memoryHits: 0,
  diskHits: 0,
  misses: 0,
  downloads: 0,
  totalRequests: 0
}

// Initialize cache directory and browser
async function initialize () {
  try {
    // Create cache directory
    await fs.mkdir(CSS_CACHE_DIR, { recursive: true })
    console.log(`CSS cache directory created: ${CSS_CACHE_DIR}`)

    // Clean old cache files on startup
    await cleanOldCacheFiles()

    // Initialize browser
    await initializeBrowser()
  } catch (error) {
    console.error('Initialization error:', error)
  }
}

// Initialize browser
async function initializeBrowser () {
  try {
    console.log('Initializing browser with Playwright...')
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security'
      ]
    })
    console.log('Browser initialized successfully')
  } catch (error) {
    console.error('Failed to initialize browser:', error)
    throw error
  }
}

// Generate cache key from URL
function getCacheKey (url) {
  return createHash('sha256').update(url).digest('hex')
}

// Get cache file path
function getCacheFilePath (cacheKey) {
  return path.join(CSS_CACHE_DIR, `${cacheKey}.css`)
}

// Clean old cache files
async function cleanOldCacheFiles () {
  try {
    const files = await fs.readdir(CSS_CACHE_DIR)
    const now = Date.now()
    let totalSize = 0
    const fileStats = []

    // Get file stats
    for (const file of files) {
      if (file.endsWith('.css')) {
        const filePath = path.join(CSS_CACHE_DIR, file)
        try {
          const stats = await fs.stat(filePath)
          totalSize += stats.size
          fileStats.push({
            path: filePath,
            mtime: stats.mtime.getTime(),
            size: stats.size
          })
        } catch (error) {
          // File might have been deleted, ignore
        }
      }
    }

    // Remove files older than CACHE_MAX_AGE
    const expiredFiles = fileStats.filter(file =>
      now - file.mtime > CACHE_MAX_AGE
    )

    for (const file of expiredFiles) {
      try {
        await fs.unlink(file.path)
        console.log(`Removed expired cache file: ${path.basename(file.path)}`)
        totalSize -= file.size
      } catch (error) {
        // Ignore errors when deleting
      }
    }

    // If cache is still too large, remove oldest files
    if (totalSize > MAX_FILE_CACHE_SIZE_MB * 1024 * 1024) {
      const remainingFiles = fileStats.filter(file =>
        !expiredFiles.includes(file)
      ).sort((a, b) => a.mtime - b.mtime) // Oldest first

      for (const file of remainingFiles) {
        if (totalSize <= MAX_FILE_CACHE_SIZE_MB * 1024 * 1024) break

        try {
          await fs.unlink(file.path)
          console.log(`Removed old cache file (size limit): ${path.basename(file.path)}`)
          totalSize -= file.size
        } catch (error) {
          // Ignore errors when deleting
        }
      }
    }

    console.log(`Cache cleanup complete. Total cache size: ${Math.round(totalSize / 1024 / 1024 * 100) / 100} MB`)
  } catch (error) {
    console.error('Error cleaning cache:', error)
  }
}

// Get CSS from memory cache
function getFromMemoryCache (cacheKey) {
  const cached = MEMORY_CACHE.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_MAX_AGE) {
    cacheStats.memoryHits++
    cacheStats.totalRequests++
    console.log(`Memory cache HIT for key: ${cacheKey}`)
    return cached.content
  }

  if (cached) {
    // Expired, remove from memory cache
    MEMORY_CACHE.delete(cacheKey)
  }

  return null
}

// Store in memory cache
function storeInMemoryCache (cacheKey, content, url) {
  // Implement LRU eviction if cache is full
  if (MEMORY_CACHE.size >= MAX_MEMORY_CACHE_SIZE) {
    // Remove oldest entry
    const firstKey = MEMORY_CACHE.keys().next().value
    MEMORY_CACHE.delete(firstKey)
  }

  MEMORY_CACHE.set(cacheKey, {
    content,
    timestamp: Date.now(),
    url,
    size: content.length
  })

  console.log(`Stored in memory cache: ${cacheKey} (${content.length} bytes)`)
}

// Get CSS from disk cache
async function getFromDiskCache (cacheKey) {
  try {
    const filePath = getCacheFilePath(cacheKey)
    const stats = await fs.stat(filePath)

    // Check if file is not expired
    if (Date.now() - stats.mtime.getTime() < CACHE_MAX_AGE) {
      const content = await fs.readFile(filePath, 'utf8')
      cacheStats.diskHits++
      cacheStats.totalRequests++
      console.log(`Disk cache HIT for key: ${cacheKey}`)

      // Also store in memory cache for faster future access
      storeInMemoryCache(cacheKey, content, 'from-disk')

      return content
    } else {
      // File is expired, remove it
      await fs.unlink(filePath)
      console.log(`Removed expired cache file: ${cacheKey}`)
    }
  } catch (error) {
    // File doesn't exist or other error, return null
  }

  return null
}

// Store CSS in disk cache
async function storeToDiskCache (cacheKey, content) {
  try {
    const filePath = getCacheFilePath(cacheKey)
    await fs.writeFile(filePath, content, 'utf8')
    console.log(`Stored to disk cache: ${cacheKey} (${content.length} bytes)`)
  } catch (error) {
    console.error('Error storing to disk cache:', error)
  }
}

// Fetch CSS using curl (fastest for simple cases)
async function fetchCSSWithCurl (url) {
  try {
    console.log(`Fetching CSS with curl: ${url}`)

    const { stdout, stderr } = await execAsync(`curl -s -L -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" "${url}"`, {
      timeout: 15000,
      maxBuffer: 10 * 1024 * 1024 // 10MB max
    })

    if (stderr && !stdout) {
      throw new Error(`Curl error: ${stderr}`)
    }

    return stdout
  } catch (error) {
    console.error('Curl fetch failed:', error.message)
    throw error
  }
}

// Fetch CSS using Playwright (for authenticated/protected resources)
async function fetchCSSWithPlaywright (url) {
  console.log(`Fetching CSS with Playwright: ${url}`)

  if (!browser) {
    throw new Error('Browser not initialized')
  }

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  })

  const page = await context.newPage()

  try {
    // Method 1: Try direct navigation
    const response = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 15000
    })

    if (response && response.ok()) {
      const content = await page.content()

      // Check if it's wrapped in HTML
      if (content.includes('<html>') || content.includes('<!DOCTYPE')) {
        return await page.evaluate(() =>
          document.body.textContent || document.body.innerText || ''
        )
      }
      return content
    }

    // Method 2: Use browser fetch API
    const cssContent = await page.evaluate(async (cssUrl) => {
      const response = await fetch(cssUrl, {
        credentials: 'include',
        headers: { Accept: 'text/css,*/*;q=0.1' }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.text()
    }, url)

    return cssContent
  } finally {
    await context.close()
  }
}

// Intelligent CSS fetcher with multiple strategies and caching
async function fetchCSSWithCaching (url, usePlaywright = false) {
  const cacheKey = getCacheKey(url)

  // Try memory cache first
  const memoryContent = getFromMemoryCache(cacheKey)
  if (memoryContent) {
    return memoryContent
  }

  // Try disk cache
  const diskContent = await getFromDiskCache(cacheKey)
  if (diskContent) {
    return diskContent
  }

  // Cache miss - fetch from network
  console.log(`Cache MISS for ${url} - fetching from network`)
  cacheStats.misses++
  cacheStats.downloads++
  cacheStats.totalRequests++

  let cssContent

  try {
    if (usePlaywright) {
      cssContent = await fetchCSSWithPlaywright(url)
    } else {
      // Try curl first (faster), fallback to Playwright
      try {
        cssContent = await fetchCSSWithCurl(url)
      } catch (curlError) {
        console.log('Curl failed, trying Playwright:', curlError.message)
        cssContent = await fetchCSSWithPlaywright(url)
      }
    }

    if (!cssContent || !cssContent.trim()) {
      throw new Error('No CSS content received')
    }

    // Store in both caches
    storeInMemoryCache(cacheKey, cssContent, url)
    await storeToDiskCache(cacheKey, cssContent)

    return cssContent
  } catch (error) {
    console.error(`Failed to fetch CSS from ${url}:`, error.message)
    throw error
  }
}

// Enhanced endpoint with caching
app.post('/generate-critical-css-cached', async (req, res) => {
  try {
    const {
      url,
      cssUrl,
      css,
      width = 1200,
      height = 800,
      timeout = 30000,
      usePlaywright = false,
      bustCache = false
    } = req.body

    if (!url) {
      return res.status(400).json({
        error: 'URL is required',
        message: 'Please provide a URL to generate critical CSS for'
      })
    }

    console.log(`Generating critical CSS for: ${url}`)

    // Ensure browser is available
    if (!browser) {
      await initializeBrowser()
    }

    let cssContent = ''
    let cssSource = 'unknown'
    let cacheUsed = false

    if (css) {
      // CSS provided directly
      cssContent = css
      cssSource = 'provided directly'
    } else if (cssUrl) {
      // CSS from URL - use caching
      if (bustCache) {
        // Force cache bust
        const cacheKey = getCacheKey(cssUrl)
        MEMORY_CACHE.delete(cacheKey)
        const filePath = getCacheFilePath(cacheKey)
        try {
          await fs.unlink(filePath)
          console.log(`Cache busted for: ${cssUrl}`)
        } catch (error) {
          // File might not exist
        }
      }

      const startTime = Date.now()
      cssContent = await fetchCSSWithCaching(cssUrl, usePlaywright)
      const fetchTime = Date.now() - startTime

      cssSource = cssUrl
      cacheUsed = fetchTime < 100 // Assume cache if very fast

      console.log(`CSS fetched in ${fetchTime}ms (cache: ${cacheUsed})`)
    } else {
      return res.status(400).json({
        error: 'CSS source required',
        message: 'Please provide either css content or cssUrl'
      })
    }

    if (!cssContent.trim()) {
      return res.status(400).json({
        error: 'No CSS content found',
        message: 'The CSS source did not contain any content'
      })
    }

    // Generate critical CSS
    const context = await browser.newContext({
      viewport: { width: parseInt(width), height: parseInt(height) }
    })

    const page = await context.newPage()

    try {
      page.setDefaultTimeout(parseInt(timeout))

      await page.goto(url, { waitUntil: 'networkidle' })

      const criticalCss = await extractCriticalCSS(page, cssContent, {
        width: parseInt(width),
        height: parseInt(height)
      })

      res.json({
        success: true,
        url,
        cssSource,
        criticalCss,
        stats: {
          originalLength: cssContent.length,
          criticalLength: criticalCss.length,
          reductionPercent: Math.round((1 - criticalCss.length / cssContent.length) * 100)
        },
        cacheInfo: {
          used: cacheUsed,
          source: cacheUsed ? 'cache' : 'network'
        },
        timestamp: new Date().toISOString()
      })
    } finally {
      await context.close()
    }
  } catch (error) {
    console.error('Error generating critical CSS:', error)

    res.status(500).json({
      error: 'Failed to generate critical CSS',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

// Cache management endpoints
app.get('/cache/stats', (req, res) => {
  const memorySize = Array.from(MEMORY_CACHE.values())
    .reduce((total, item) => total + item.size, 0)

  res.json({
    stats: cacheStats,
    memory: {
      entries: MEMORY_CACHE.size,
      maxEntries: MAX_MEMORY_CACHE_SIZE,
      totalSize: memorySize,
      entries_list: Array.from(MEMORY_CACHE.entries()).map(([key, value]) => ({
        key,
        url: value.url,
        size: value.size,
        age: Date.now() - value.timestamp
      }))
    },
    disk: {
      directory: CSS_CACHE_DIR,
      maxSizeMB: MAX_FILE_CACHE_SIZE_MB
    },
    config: {
      maxAgeMs: CACHE_MAX_AGE,
      maxAgeHours: CACHE_MAX_AGE / (60 * 60 * 1000)
    }
  })
})

app.delete('/cache/clear', async (req, res) => {
  try {
    // Clear memory cache
    const memoryClearedCount = MEMORY_CACHE.size
    MEMORY_CACHE.clear()

    // Clear disk cache
    const files = await fs.readdir(CSS_CACHE_DIR)
    let diskClearedCount = 0

    for (const file of files) {
      if (file.endsWith('.css')) {
        await fs.unlink(path.join(CSS_CACHE_DIR, file))
        diskClearedCount++
      }
    }

    // Reset stats
    cacheStats = {
      memoryHits: 0,
      diskHits: 0,
      misses: 0,
      downloads: 0,
      totalRequests: 0
    }

    res.json({
      success: true,
      cleared: {
        memoryEntries: memoryClearedCount,
        diskFiles: diskClearedCount
      }
    })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to clear cache',
      message: error.message
    })
  }
})

// Extract critical CSS (reuse from previous implementation)
async function extractCriticalCSS (page, css, options = {}) {
  const { width = 1200, height = 800 } = options

  await page.addStyleTag({ content: css })
  await page.waitForTimeout(1000)

  const criticalCSS = await page.evaluate(({ cssContent, viewportHeight, viewportWidth }) => {
    const style = document.createElement('style')
    style.textContent = cssContent
    document.head.appendChild(style)

    const sheet = style.sheet
    const criticalRules = []

    const elementsInViewport = Array.from(document.querySelectorAll('*')).filter(el => {
      const rect = el.getBoundingClientRect()
      return rect.top < viewportHeight &&
             rect.bottom >= 0 &&
             rect.left < viewportWidth &&
             rect.right >= 0 &&
             (rect.width > 0 || rect.height > 0)
    })

    function selectorMatchesVisibleElement (selector) {
      try {
        const matchingElements = document.querySelectorAll(selector)
        return Array.from(matchingElements).some(el => {
          const rect = el.getBoundingClientRect()
          return elementsInViewport.includes(el) &&
                 (rect.width > 0 || rect.height > 0)
        })
      } catch (e) {
        return false
      }
    }

    function isAlwaysCritical (selector) {
      const criticalPatterns = [
        /^(html|body|\*)\s*[,{]/,
        /\.(critical|above-fold|hero|header|nav|menu|logo)/i,
        /^@import/,
        /^@charset/,
        /^@font-face/,
        /:root/,
        /^h[1-6](\s|$|[.:#\[])/i  // eslint-disable-line
      ]

      return criticalPatterns.some(pattern => pattern.test(selector))
    }

    if (sheet && sheet.cssRules) {
      const CSSRule = {}
      Array.from(sheet.cssRules).forEach(rule => {
        if (rule.type === CSSRule.STYLE_RULE) {
          const selector = rule.selectorText

          if (isAlwaysCritical(selector) || selectorMatchesVisibleElement(selector)) {
            criticalRules.push(rule.cssText)
          }
        } else if (rule.type === CSSRule.MEDIA_RULE) {
          const mediaText = rule.media.mediaText
          const criticalMediaRules = []

          Array.from(rule.cssRules).forEach(innerRule => {
            if (innerRule.type === CSSRule.STYLE_RULE) {
              const selector = innerRule.selectorText

              if (isAlwaysCritical(selector) || selectorMatchesVisibleElement(selector)) {
                criticalMediaRules.push(innerRule.cssText)
              }
            }
          })

          if (criticalMediaRules.length > 0) {
            criticalRules.push(`@media ${mediaText} {\n${criticalMediaRules.join('\n')}\n}`)
          }
        } else if (rule.type === CSSRule.IMPORT_RULE ||
                   rule.type === CSSRule.CHARSET_RULE ||
                   rule.type === CSSRule.FONT_FACE_RULE) {
          criticalRules.push(rule.cssText)
        }
      })
    }

    document.head.removeChild(style)
    return criticalRules.join('\n')
  }, {
    cssContent: css,
    viewportHeight: height,
    viewportWidth: width
  })

  return criticalCSS
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    browserReady: browser !== null,
    cache: {
      memoryEntries: MEMORY_CACHE.size,
      directory: CSS_CACHE_DIR
    },
    features: ['css-caching', 'curl-fetch', 'playwright-fetch', 'cache-management']
  })
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully')
  if (browser) {
    await browser.close()
  }
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully')
  if (browser) {
    await browser.close()
  }
  process.exit(0)
})

// Start server
app.listen(PORT, async () => {
  console.log(`Cached Critical CSS service running on port ${PORT}`)
  console.log('Endpoints:')
  console.log('  POST /generate-critical-css-cached - Generate with caching')
  console.log('  GET  /cache/stats - View cache statistics')
  console.log('  DELETE /cache/clear - Clear all caches')
  console.log('  GET  /health - Health check')

  await initialize()
})

export default app
