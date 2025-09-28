import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { chromium } from 'playwright'

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(helmet())
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Global browser instance for reuse
let browser = null

// Initialize browser
async function initializeBrowser () {
  try {
    console.log('Initializing browser with Playwright official image...')
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
    console.error('Error details:', error.message)
  }
}

// Helper function to fetch with retry and better error handling
async function fetchWithRetry (url, options = {}, maxRetries = 3) {
  const { timeout = 10000, ...fetchOptions } = options

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Fetching ${url} (attempt ${attempt}/${maxRetries})`)

      // Create AbortController for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          Accept: 'text/css,*/*;q=0.1',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          DNT: '1',
          Connection: 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          ...fetchOptions.headers
        }
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return response
    } catch (error) {
      console.error(`Fetch attempt ${attempt} failed:`, error.message)

      // Check if it's a network/DNS error
      if (error.code === 'EAI_AGAIN' || error.code === 'ENOTFOUND' || error.message.includes('fetch failed')) {
        if (attempt === maxRetries) {
          // Provide helpful error message with suggestions
          const suggestions = [
            'This appears to be a DNS resolution issue within the Docker container',
            'Try using an IP address instead of hostname',
            'Check if the website is accessible from your host machine',
            'Consider using the /generate-critical-css endpoint with pre-downloaded CSS instead'
          ]
          throw new Error(`DNS resolution failed for ${url}. Suggestions: ${suggestions.join('; ')}`)
        }
        // Wait longer between retries for DNS issues
        await new Promise(resolve => setTimeout(resolve, attempt * 2000))
      } else if (error.name === 'AbortError') {
        throw new Error(`Request timeout: ${url} took longer than ${timeout}ms to respond`)
      } else if (attempt === maxRetries) {
        throw error
      } else {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, attempt * 1000))
      }
    }
  }
}

// Alternative endpoint for CSS content passed directly
app.post('/generate-critical-css-with-content', async (req, res) => {
  try {
    const { url, cssContent, width = 1200, height = 800, timeout = 30000 } = req.body

    if (!url) {
      return res.status(400).json({
        error: 'URL is required',
        message: 'Please provide a URL to generate critical CSS for'
      })
    }

    if (!cssContent) {
      return res.status(400).json({
        error: 'CSS content is required',
        message: 'Please provide CSS content to analyze'
      })
    }

    console.log(`Generating critical CSS for: ${url} with provided CSS content`)

    // Ensure browser is available
    if (!browser) {
      await initializeBrowser()
      if (!browser) {
        throw new Error('Browser initialization failed')
      }
    }

    // Generate critical CSS using Playwright
    const criticalCss = await extractCriticalCSS(url, cssContent, {
      width: parseInt(width),
      height: parseInt(height),
      timeout: parseInt(timeout)
    })

    console.log(`Critical CSS generated successfully for: ${url}`)

    res.json({
      success: true,
      url,
      criticalCss,
      stats: {
        originalLength: cssContent.length,
        criticalLength: criticalCss.length,
        reductionPercent: Math.round((1 - criticalCss.length / cssContent.length) * 100)
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error generating critical CSS:', error)

    res.status(500).json({
      error: 'Failed to generate critical CSS',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

// Extract elements above the fold
async function extractAboveFoldElements (url, options = {}) {
  const { width = 1200, height = 800, timeout = 30000 } = options

  if (!browser) {
    throw new Error('Browser not initialized')
  }

  const context = await browser.newContext({
    viewport: { width, height },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  })

  const page = await context.newPage()

  try {
    // Set timeout
    page.setDefaultTimeout(timeout)

    // Navigate to the page
    await page.goto(url, { waitUntil: 'networkidle' })

    // Wait a bit for page to fully load
    await page.waitForTimeout(1000)

    // Extract elements above the fold
    const aboveFoldElements = await page.evaluate(({ viewportHeight }) => {
      const elements = []
      const allClasses = new Set()
      const allIds = new Set()
      const allElements = new Set()
      const allCombinations = new Set()

      // Get all visible elements
      const allDOMElements = Array.from(document.querySelectorAll('*'))

      allDOMElements.forEach(el => {
        const rect = el.getBoundingClientRect()
        const computedStyle = window.getComputedStyle(el)

        // Check if element is above the fold (visible in viewport)
        const isAboveFold = rect.top < viewportHeight &&
                           rect.bottom >= 0 &&
                           rect.left < window.innerWidth &&
                           rect.right >= 0

        // Skip if not above fold or not visible
        if (!isAboveFold || computedStyle.display === 'none' ||
            computedStyle.visibility === 'hidden' ||
            computedStyle.opacity === '0' ||
            rect.width === 0 || rect.height === 0) {
          return
        }

        // Collect selectors for CSS extraction
        const tagName = el.tagName.toLowerCase()
        allElements.add(tagName)

        // Collect classes
        if (el.className) {
          Array.from(el.classList).forEach(cls => {
            allClasses.add(cls)
            // Also add combinations like 'div.classname'
            allCombinations.add(`${tagName}.${cls}`)
          })
        }

        // Collect IDs
        if (el.id) {
          allIds.add(el.id)
          // Also add combinations like 'div#idname'
          allCombinations.add(`${tagName}#${el.id}`)

          // Add class+ID combinations
          if (el.className) {
            Array.from(el.classList).forEach(cls => {
              allCombinations.add(`${tagName}#${el.id}.${cls}`)
              allCombinations.add(`#${el.id}.${cls}`)
            })
          }
        }

        // Create multi-class combinations for elements with multiple classes
        if (el.classList.length > 1) {
          const classes = Array.from(el.classList)
          for (let i = 0; i < classes.length; i++) {
            for (let j = i + 1; j < classes.length; j++) {
              allCombinations.add(`.${classes[i]}.${classes[j]}`)
              allCombinations.add(`${tagName}.${classes[i]}.${classes[j]}`)
            }
          }
        }

        // Get element information for detailed response
        const elementInfo = {
          tagName: el.tagName.toLowerCase(),
          id: el.id || null,
          classes: el.className ? Array.from(el.classList) : [],
          textContent: el.textContent ? el.textContent.trim().substring(0, 100) : null,
          position: {
            top: Math.round(rect.top),
            left: Math.round(rect.left),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          attributes: {},
          styles: {}
        }

        // Get relevant attributes
        const relevantAttrs = ['href', 'src', 'alt', 'title', 'role', 'aria-label']
        relevantAttrs.forEach(attr => {
          if (el.hasAttribute(attr)) {
            elementInfo.attributes[attr] = el.getAttribute(attr)
          }
        })

        // Get computed styles that affect visibility and layout
        const relevantStyles = [
          'display', 'position', 'fontSize', 'fontFamily', 'fontWeight',
          'color', 'backgroundColor', 'border', 'margin', 'padding',
          'zIndex', 'transform'
        ]
        relevantStyles.forEach(style => {
          const value = computedStyle[style]
          if (value && value !== 'auto' && value !== 'none' && value !== 'normal') {
            elementInfo.styles[style] = value
          }
        })

        // Generate a simple selector for the element
        let selector = el.tagName.toLowerCase()
        if (el.id) {
          selector += `#${el.id}`
        }
        if (el.className) {
          selector += `.${Array.from(el.classList).join('.')}`
        }
        elementInfo.selector = selector

        elements.push(elementInfo)
      })

      // Sort elements by their position (top to bottom, left to right)
      elements.sort((a, b) => {
        if (Math.abs(a.position.top - b.position.top) < 10) {
          return a.position.left - b.position.left
        }
        return a.position.top - b.position.top
      })

      return {
        elements,
        selectors: {
          classes: Array.from(allClasses).sort(),
          ids: Array.from(allIds).sort(),
          elements: Array.from(allElements).sort(),
          combinations: Array.from(allCombinations).sort()
        }
      }
    }, { viewportHeight: height })

    return aboveFoldElements
  } finally {
    await context.close()
  }
}

// Extract critical CSS using Playwright
async function extractCriticalCSS (url, css, options = {}) {
  const { width = 1200, height = 800, timeout = 30000 } = options

  if (!browser) {
    throw new Error('Browser not initialized')
  }

  const context = await browser.newContext({
    viewport: { width, height },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  })

  const page = await context.newPage()

  try {
    // Set timeout
    page.setDefaultTimeout(timeout)

    // Navigate to the page
    await page.goto(url, { waitUntil: 'networkidle' })

    // Inject the CSS into the page
    await page.addStyleTag({ content: css })

    // Wait a bit for styles to apply
    await page.waitForTimeout(1000)

    // Extract critical CSS by analyzing which styles are used above the fold
    const criticalCSS = await page.evaluate(({ cssContent, viewportHeight }) => {
      // Parse CSS and find used selectors
      const style = document.createElement('style')
      style.textContent = cssContent
      document.head.appendChild(style)

      const sheet = style.sheet
      const usedSelectors = new Set()
      const criticalRules = []

      // Get all elements in the viewport (above the fold)
      const elementsInViewport = Array.from(document.querySelectorAll('*')).filter(el => {
        const rect = el.getBoundingClientRect()
        return rect.top < viewportHeight && rect.bottom >= 0 && rect.left < window.innerWidth && rect.right >= 0
      })

      // Check each CSS rule
      if (sheet && sheet.cssRules) {
        const CSSRule = window.CSSRule || {}
        Array.from(sheet.cssRules).forEach(rule => {
          if (rule.type === CSSRule.STYLE_RULE) {
            try {
              // Check if any element in viewport matches this selector
              const matchingElements = document.querySelectorAll(rule.selectorText)
              const hasVisibleMatch = Array.from(matchingElements).some(el =>
                elementsInViewport.includes(el)
              )

              if (hasVisibleMatch || isAlwaysCritical(rule.selectorText)) {
                criticalRules.push(rule.cssText)
                usedSelectors.add(rule.selectorText)
              }
            } catch (e) {
              // Some selectors might be invalid, skip them
            }
          } else if (rule.type === CSSRule.MEDIA_RULE) {
            // Handle media queries for mobile-first approaches
            const mediaText = rule.media.mediaText
            if (shouldIncludeMediaQuery(mediaText)) {
              Array.from(rule.cssRules).forEach(innerRule => {
                if (innerRule.type === CSSRule.STYLE_RULE) {
                  try {
                    const matchingElements = document.querySelectorAll(innerRule.selectorText)
                    const hasVisibleMatch = Array.from(matchingElements).some(el =>
                      elementsInViewport.includes(el)
                    )

                    if (hasVisibleMatch || isAlwaysCritical(innerRule.selectorText)) {
                      if (!criticalRules.find(rule => rule.includes(`@media ${mediaText}`))) {
                        criticalRules.push(`@media ${mediaText} { ${innerRule.cssText} }`)
                      }
                    }
                  } catch (e) {
                    // Skip invalid selectors
                  }
                }
              })
            }
          }
        })
      }

      // Helper function to determine if a selector should always be included
      function isAlwaysCritical (selector) {
        const criticalSelectors = [
          'html', 'body', '*',
          '.critical', '[critical]',
          /\.hero/, /\.header/, /\.navbar/, /\.menu/,
          /^h[1-6]/, /^p$/, /^a$/
        ]

        return criticalSelectors.some(critical => {
          if (typeof critical === 'string') {
            return selector.includes(critical)
          } else if (critical instanceof RegExp) {
            return critical.test(selector)
          }
          return false
        })
      }

      // Helper function to determine if media query should be included
      function shouldIncludeMediaQuery (mediaText) {
        // Include small screen media queries as they're often critical
        return mediaText.includes('max-width') &&
               (mediaText.includes('768px') || mediaText.includes('mobile') || mediaText.includes('480px'))
      }

      // Clean up
      document.head.removeChild(style)

      return criticalRules.join('\n')
    }, { cssContent: css, viewportHeight: height })

    return criticalCSS
  } finally {
    await context.close()
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    browserReady: browser !== null
  })
})

// Endpoint to get elements above the fold
app.post('/get-above-fold-elements', async (req, res) => {
  try {
    const { url, width = 1200, height = 800, timeout = 30000, includeDetails = false } = req.body

    if (!url) {
      return res.status(400).json({
        error: 'URL is required',
        message: 'Please provide a URL to analyze elements for'
      })
    }

    console.log(`Getting above fold elements for: ${url}`)

    // Ensure browser is available
    if (!browser) {
      await initializeBrowser()
      if (!browser) {
        throw new Error('Browser initialization failed')
      }
    }

    // Extract elements above the fold
    const result = await extractAboveFoldElements(url, {
      width: parseInt(width),
      height: parseInt(height),
      timeout: parseInt(timeout)
    })

    const { elements, selectors } = result

    console.log(`Found ${elements.length} elements above the fold for: ${url}`)

    // Prepare response based on includeDetails flag
    const response = {
      success: true,
      url,
      viewport: { width: parseInt(width), height: parseInt(height) },
      // New comprehensive selector information for extract_rules
      wantedSelectors: selectors,
      // Legacy support - just classes for backward compatibility
      wantedClasses: selectors.classes,
      stats: {
        totalElements: elements.length,
        totalClasses: selectors.classes.length,
        totalIds: selectors.ids.length,
        totalElementTypes: selectors.elements.length,
        totalCombinations: selectors.combinations.length,
        elementsByTag: elements.reduce((acc, el) => {
          acc[el.tagName] = (acc[el.tagName] || 0) + 1
          return acc
        }, {}),
        elementsWithText: elements.filter(el => el.textContent).length,
        elementsWithClasses: elements.filter(el => el.classes.length > 0).length,
        elementsWithIds: elements.filter(el => el.id).length
      },
      timestamp: new Date().toISOString()
    }

    // Include detailed element information only if requested
    if (includeDetails) {
      response.elements = elements
    }

    res.json(response)
  } catch (error) {
    console.error('Error getting above fold elements:', error)

    res.status(500).json({
      error: 'Failed to get above fold elements',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

// Network diagnostic endpoint
app.get('/network-test/:hostname?', async (req, res) => {
  const { hostname = 'www.google.com' } = req.params

  try {
    console.log(`Testing network connectivity to: ${hostname}`)

    const testUrl = hostname.startsWith('http') ? hostname : `https://${hostname}`
    const start = Date.now()

    const response = await fetchWithRetry(testUrl, {
      timeout: 10000,
      method: 'HEAD' // Just check if we can reach it
    }, 2)

    const duration = Date.now() - start

    res.json({
      success: true,
      hostname,
      testUrl,
      status: response.status,
      statusText: response.statusText,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      hostname,
      error: error.message,
      errorCode: error.code,
      timestamp: new Date().toISOString(),
      suggestions: [
        'Check if the hostname is correct',
        'Verify network connectivity',
        'Try again in a few moments (DNS might be temporarily unavailable)',
        'Use an IP address if the hostname cannot be resolved'
      ]
    })
  }
})

// Main endpoint for generating critical CSS
app.post('/generate-critical-css', async (req, res) => {
  try {
    const { url, css, width = 1200, height = 800, timeout = 30000 } = req.body

    // Validate required parameters
    if (!url) {
      return res.status(400).json({
        error: 'URL is required',
        message: 'Please provide a URL to generate critical CSS for'
      })
    }

    if (!css) {
      return res.status(400).json({
        error: 'CSS is required',
        message: 'Please provide CSS content to analyze'
      })
    }

    console.log(`Generating critical CSS for: ${url}`)

    // Ensure browser is available
    if (!browser) {
      await initializeBrowser()
      if (!browser) {
        throw new Error('Browser initialization failed')
      }
    }

    // Generate critical CSS using Playwright
    const criticalCss = await extractCriticalCSS(url, css, {
      width: parseInt(width),
      height: parseInt(height),
      timeout: parseInt(timeout)
    })

    console.log(`Critical CSS generated successfully for: ${url}`)

    res.json({
      success: true,
      url,
      criticalCss,
      stats: {
        originalLength: css.length,
        criticalLength: criticalCss.length,
        reductionPercent: Math.round((1 - criticalCss.length / css.length) * 100)
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error generating critical CSS:', error)

    res.status(500).json({
      error: 'Failed to generate critical CSS',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

// Endpoint for generating critical CSS with external CSS file
app.post('/generate-critical-css-from-url', async (req, res) => {
  try {
    const { url, cssUrl, width = 1200, height = 800, timeout = 30000 } = req.body

    if (!url) {
      return res.status(400).json({
        error: 'URL is required',
        message: 'Please provide a URL to generate critical CSS for'
      })
    }

    if (!cssUrl) {
      return res.status(400).json({
        error: 'CSS URL is required',
        message: 'Please provide a CSS URL to analyze'
      })
    }

    console.log(`Generating critical CSS for: ${url} with CSS from: ${cssUrl}`)

    // Ensure browser is available
    if (!browser) {
      await initializeBrowser()
      if (!browser) {
        throw new Error('Browser initialization failed')
      }
    }

    // Fetch CSS content from URL
    console.log(`Fetching CSS from: ${cssUrl}`)
    const cssResponse = await fetchWithRetry(cssUrl, { timeout: 15000 })
    const cssContent = await cssResponse.text()
    console.log(`Successfully fetched CSS (${cssContent.length} characters)`)

    // Generate critical CSS using Playwright
    const criticalCss = await extractCriticalCSS(url, cssContent, {
      width: parseInt(width),
      height: parseInt(height),
      timeout: parseInt(timeout)
    })

    console.log(`Critical CSS generated successfully for: ${url}`)

    res.json({
      success: true,
      url,
      cssUrl,
      criticalCss,
      stats: {
        originalLength: cssContent.length,
        criticalLength: criticalCss.length,
        reductionPercent: Math.round((1 - criticalCss.length / cssContent.length) * 100)
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error generating critical CSS:', error)

    res.status(500).json({
      error: 'Failed to generate critical CSS',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }
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

// Error handling
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error)
  res.status(500).json({
    error: 'Internal server error',
    message: error.message,
    timestamp: new Date().toISOString()
  })
})

// Start server
app.listen(PORT, async () => {
  console.log(`Critical CSS service running on port ${PORT}`)
  console.log(`Health check available at: http://localhost:${PORT}/health`)

  // Initialize browser on startup
  await initializeBrowser()
})

export default app
