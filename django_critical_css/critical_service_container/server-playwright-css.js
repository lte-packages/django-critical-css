import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { chromium } from 'playwright';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global browser instance for reuse
let browser = null;

// Initialize browser
async function initializeBrowser() {
  try {
    console.log('Initializing browser with Playwright...');
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security'
      ]
    });
    console.log('Browser initialized successfully');
  } catch (error) {
    console.error('Failed to initialize browser:', error);
    process.exit(1);
  }
}

// Fetch CSS content using Playwright (better than fetch for authenticated/protected resources)
async function fetchCSSWithPlaywright(page, cssUrl) {
  console.log(`Fetching CSS using Playwright: ${cssUrl}`);

  try {
    // Method 1: Try to navigate directly to CSS file
    const response = await page.goto(cssUrl, {
      waitUntil: 'networkidle',
      timeout: 15000
    });

    if (response && response.ok()) {
      const cssContent = await page.content();
      // Remove HTML wrapper if present (CSS files sometimes get wrapped in HTML)
      if (cssContent.includes('<html>') || cssContent.includes('<!DOCTYPE')) {
        // Extract CSS from pre tag or body
        const cssMatch = cssContent.match(/<pre[^>]*>([\s\S]*?)<\/pre>|<body[^>]*>([\s\S]*?)<\/body>/);
        if (cssMatch) {
          return cssMatch[1].trim();
        }
        // If no pre/body tags, try to get text content
        return await page.evaluate(() => document.body.textContent || document.body.innerText || '');
      }
      return cssContent;
    }

    // Method 2: Use page.evaluate to fetch via browser's fetch API
    // This preserves all browser context including cookies, auth tokens, etc.
    const cssContent = await page.evaluate(async (url) => {
      try {
        const response = await fetch(url, {
          credentials: 'include', // Include cookies
          headers: {
            'Accept': 'text/css,*/*;q=0.1'
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.text();
      } catch (error) {
        throw new Error(`Failed to fetch CSS: ${error.message}`);
      }
    }, cssUrl);

    return cssContent;

  } catch (error) {
    console.error(`Error fetching CSS with Playwright: ${error.message}`);
    throw new Error(`Failed to fetch CSS file: ${error.message}`);
  }
}

// Enhanced method to extract all CSS from a page (including external stylesheets)
async function extractAllPageCSS(page) {
  return await page.evaluate(() => {
    const allCSS = [];

    // Get inline styles
    const styleElements = document.querySelectorAll('style');
    styleElements.forEach(style => {
      if (style.textContent.trim()) {
        allCSS.push({
          type: 'inline',
          content: style.textContent
        });
      }
    });

    // Get external stylesheets (already loaded)
    for (let i = 0; i < document.styleSheets.length; i++) {
      try {
        const styleSheet = document.styleSheets[i];
        if (styleSheet.href) {
          // External stylesheet
          const rules = Array.from(styleSheet.cssRules || styleSheet.rules || []);
          const cssText = rules.map(rule => rule.cssText).join('\n');
          if (cssText.trim()) {
            allCSS.push({
              type: 'external',
              href: styleSheet.href,
              content: cssText
            });
          }
        }
      } catch (e) {
        // CORS-blocked stylesheet, we'll need to fetch it separately
        console.log(`Could not access stylesheet: ${document.styleSheets[i].href}`);
      }
    }

    return allCSS;
  });
}

// Enhanced endpoint using Playwright for CSS access
app.post('/generate-critical-css-playwright', async (req, res) => {
  try {
    const { url, cssUrl, width = 1200, height = 800, timeout = 30000, extractPageCSS = false } = req.body;

    if (!url) {
      return res.status(400).json({
        error: 'URL is required',
        message: 'Please provide a URL to generate critical CSS for'
      });
    }

    console.log(`Generating critical CSS for: ${url}`);
    if (cssUrl) {
      console.log(`Using CSS from: ${cssUrl}`);
    }

    // Ensure browser is available
    if (!browser) {
      await initializeBrowser();
    }

    const context = await browser.newContext({
      viewport: { width: parseInt(width), height: parseInt(height) },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });

    const page = await context.newPage();

    try {
      // Set timeout
      page.setDefaultTimeout(parseInt(timeout));

      // Navigate to the main page first to establish context
      console.log(`Loading page: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle' });

      let cssContent = '';
      let cssSource = 'unknown';

      if (cssUrl) {
        // Fetch CSS using Playwright (preserves auth/cookies)
        cssContent = await fetchCSSWithPlaywright(page, cssUrl);
        cssSource = cssUrl;
      } else if (extractPageCSS) {
        // Extract all CSS from the current page
        const allCSS = await extractAllPageCSS(page);
        cssContent = allCSS.map(css => css.content).join('\n\n');
        cssSource = 'extracted from page';

        console.log(`Extracted CSS from ${allCSS.length} sources:`,
          allCSS.map(css => css.type === 'external' ? css.href : 'inline'));
      } else {
        return res.status(400).json({
          error: 'CSS source required',
          message: 'Please provide either cssUrl or set extractPageCSS=true'
        });
      }

      if (!cssContent.trim()) {
        return res.status(400).json({
          error: 'No CSS content found',
          message: 'The CSS source did not contain any content'
        });
      }

      console.log(`Successfully loaded CSS (${cssContent.length} characters) from: ${cssSource}`);

      // Generate critical CSS
      const criticalCss = await extractCriticalCSS(page, cssContent, {
        width: parseInt(width),
        height: parseInt(height)
      });

      console.log(`Critical CSS generated successfully for: ${url}`);

      res.json({
        success: true,
        url: url,
        cssSource: cssSource,
        criticalCss: criticalCss,
        stats: {
          originalLength: cssContent.length,
          criticalLength: criticalCss.length,
          reductionPercent: Math.round((1 - criticalCss.length / cssContent.length) * 100)
        },
        timestamp: new Date().toISOString()
      });

    } finally {
      await context.close();
    }

  } catch (error) {
    console.error('Error generating critical CSS:', error);

    res.status(500).json({
      error: 'Failed to generate critical CSS',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Enhanced critical CSS extraction
async function extractCriticalCSS(page, css, options = {}) {
  const { width = 1200, height = 800 } = options;

  // Inject the CSS into the page
  await page.addStyleTag({ content: css });

  // Wait for styles to apply
  await page.waitForTimeout(1000);

  // Extract critical CSS by analyzing which styles are used above the fold
  const criticalCSS = await page.evaluate(({ cssContent, viewportHeight, viewportWidth }) => {
    // Create a temporary style element
    const style = document.createElement('style');
    style.textContent = cssContent;
    document.head.appendChild(style);

    const sheet = style.sheet;
    const criticalRules = [];

    // Get all elements in the viewport (above the fold)
    const elementsInViewport = Array.from(document.querySelectorAll('*')).filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.top < viewportHeight &&
             rect.bottom >= 0 &&
             rect.left < viewportWidth &&
             rect.right >= 0 &&
             (rect.width > 0 || rect.height > 0); // Element has dimensions
    });

    // Helper function to test if selector matches any visible element
    function selectorMatchesVisibleElement(selector) {
      try {
        const matchingElements = document.querySelectorAll(selector);
        return Array.from(matchingElements).some(el => {
          const rect = el.getBoundingClientRect();
          return elementsInViewport.includes(el) &&
                 (rect.width > 0 || rect.height > 0);
        });
      } catch (e) {
        return false; // Invalid selector
      }
    }

    // Helper function to determine if a selector should always be included
    function isAlwaysCritical(selector) {
      const criticalPatterns = [
        /^(html|body|\*)\s*[,{]/, // Base selectors
        /\.(critical|above-fold|hero|header|nav|menu|logo)/i, // Common critical classes
        /^@import/, // Import statements
        /^@charset/, // Charset declarations
        /^@font-face/, // Font declarations (often critical)
        /:root/, // CSS custom properties
        /^h[1-6](\s|$|[.:#\[])/i, // Headings
      ];

      return criticalPatterns.some(pattern => pattern.test(selector));
    }

    // Process CSS rules
    if (sheet && sheet.cssRules) {
      Array.from(sheet.cssRules).forEach(rule => {
        if (rule.type === CSSRule.STYLE_RULE) {
          const selector = rule.selectorText;

          if (isAlwaysCritical(selector) || selectorMatchesVisibleElement(selector)) {
            criticalRules.push(rule.cssText);
          }
        } else if (rule.type === CSSRule.MEDIA_RULE) {
          // Handle media queries
          const mediaText = rule.media.mediaText;
          const criticalMediaRules = [];

          Array.from(rule.cssRules).forEach(innerRule => {
            if (innerRule.type === CSSRule.STYLE_RULE) {
              const selector = innerRule.selectorText;

              if (isAlwaysCritical(selector) || selectorMatchesVisibleElement(selector)) {
                criticalMediaRules.push(innerRule.cssText);
              }
            }
          });

          if (criticalMediaRules.length > 0) {
            criticalRules.push(`@media ${mediaText} {\n${criticalMediaRules.join('\n')}\n}`);
          }
        } else if (rule.type === CSSRule.IMPORT_RULE ||
                   rule.type === CSSRule.CHARSET_RULE ||
                   rule.type === CSSRule.FONT_FACE_RULE) {
          // Always include imports, charset, and font-face rules
          criticalRules.push(rule.cssText);
        }
      });
    }

    // Clean up
    document.head.removeChild(style);

    return criticalRules.join('\n');
  }, {
    cssContent: css,
    viewportHeight: height,
    viewportWidth: width
  });

  return criticalCSS;
}

// Keep existing endpoints for backward compatibility
// ... (include your existing endpoints here)

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    browserReady: browser !== null,
    features: ['playwright-css-access', 'critical-css-extraction', 'page-css-extraction']
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

// Start server
app.listen(PORT, async () => {
  console.log(`Enhanced Critical CSS service running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`New endpoint: POST /generate-critical-css-playwright`);

  // Initialize browser on startup
  await initializeBrowser();
});

export default app;
