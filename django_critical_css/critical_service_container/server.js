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
    console.log('Initializing browser with Playwright official image...');
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
    console.error('Error details:', error.message);
  }
}

// Extract critical CSS using Playwright
async function extractCriticalCSS(url, css, options = {}) {
  const { width = 1200, height = 800, timeout = 30000 } = options;

  if (!browser) {
    throw new Error('Browser not initialized');
  }

  const context = await browser.newContext({
    viewport: { width, height },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  });

  const page = await context.newPage();

  try {
    // Set timeout
    page.setDefaultTimeout(timeout);

    // Navigate to the page
    await page.goto(url, { waitUntil: 'networkidle' });

    // Inject the CSS into the page
    await page.addStyleTag({ content: css });

    // Wait a bit for styles to apply
    await page.waitForTimeout(1000);

    // Extract critical CSS by analyzing which styles are used above the fold
    const criticalCSS = await page.evaluate(({ cssContent, viewportHeight }) => {
      // Parse CSS and find used selectors
      const style = document.createElement('style');
      style.textContent = cssContent;
      document.head.appendChild(style);

      const sheet = style.sheet;
      const usedSelectors = new Set();
      const criticalRules = [];

      // Get all elements in the viewport (above the fold)
      const elementsInViewport = Array.from(document.querySelectorAll('*')).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.top < viewportHeight && rect.bottom >= 0 && rect.left < window.innerWidth && rect.right >= 0;
      });

      // Check each CSS rule
      if (sheet && sheet.cssRules) {
        Array.from(sheet.cssRules).forEach(rule => {
          if (rule.type === CSSRule.STYLE_RULE) {
            try {
              // Check if any element in viewport matches this selector
              const matchingElements = document.querySelectorAll(rule.selectorText);
              const hasVisibleMatch = Array.from(matchingElements).some(el =>
                elementsInViewport.includes(el)
              );

              if (hasVisibleMatch || isAlwaysCritical(rule.selectorText)) {
                criticalRules.push(rule.cssText);
                usedSelectors.add(rule.selectorText);
              }
            } catch (e) {
              // Some selectors might be invalid, skip them
            }
          } else if (rule.type === CSSRule.MEDIA_RULE) {
            // Handle media queries for mobile-first approaches
            const mediaText = rule.media.mediaText;
            if (shouldIncludeMediaQuery(mediaText)) {
              Array.from(rule.cssRules).forEach(innerRule => {
                if (innerRule.type === CSSRule.STYLE_RULE) {
                  try {
                    const matchingElements = document.querySelectorAll(innerRule.selectorText);
                    const hasVisibleMatch = Array.from(matchingElements).some(el =>
                      elementsInViewport.includes(el)
                    );

                    if (hasVisibleMatch || isAlwaysCritical(innerRule.selectorText)) {
                      if (!criticalRules.find(rule => rule.includes(`@media ${mediaText}`))) {
                        criticalRules.push(`@media ${mediaText} { ${innerRule.cssText} }`);
                      }
                    }
                  } catch (e) {
                    // Skip invalid selectors
                  }
                }
              });
            }
          }
        });
      }

      // Helper function to determine if a selector should always be included
      function isAlwaysCritical(selector) {
        const criticalSelectors = [
          'html', 'body', '*',
          '.critical', '[critical]',
          /\.hero/, /\.header/, /\.navbar/, /\.menu/,
          /^h[1-6]/, /^p$/, /^a$/
        ];

        return criticalSelectors.some(critical => {
          if (typeof critical === 'string') {
            return selector.includes(critical);
          } else if (critical instanceof RegExp) {
            return critical.test(selector);
          }
          return false;
        });
      }

      // Helper function to determine if media query should be included
      function shouldIncludeMediaQuery(mediaText) {
        // Include small screen media queries as they're often critical
        return mediaText.includes('max-width') &&
               (mediaText.includes('768px') || mediaText.includes('mobile') || mediaText.includes('480px'));
      }

      // Clean up
      document.head.removeChild(style);

      return criticalRules.join('\n');
    }, { cssContent: css, viewportHeight: height });

    return criticalCSS;

  } finally {
    await context.close();
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    browserReady: browser !== null
  });
});

// Main endpoint for generating critical CSS
app.post('/generate-critical-css', async (req, res) => {
  try {
    const { url, css, width = 1200, height = 800, timeout = 30000 } = req.body;

    // Validate required parameters
    if (!url) {
      return res.status(400).json({
        error: 'URL is required',
        message: 'Please provide a URL to generate critical CSS for'
      });
    }

    if (!css) {
      return res.status(400).json({
        error: 'CSS is required',
        message: 'Please provide CSS content to analyze'
      });
    }

    console.log(`Generating critical CSS for: ${url}`);

    // Ensure browser is available
    if (!browser) {
      await initializeBrowser();
      if (!browser) {
        throw new Error('Browser initialization failed');
      }
    }

    // Generate critical CSS using Playwright
    const criticalCss = await extractCriticalCSS(url, css, {
      width: parseInt(width),
      height: parseInt(height),
      timeout: parseInt(timeout)
    });

    console.log(`Critical CSS generated successfully for: ${url}`);

    res.json({
      success: true,
      url: url,
      criticalCss: criticalCss,
      stats: {
        originalLength: css.length,
        criticalLength: criticalCss.length,
        reductionPercent: Math.round((1 - criticalCss.length / css.length) * 100)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error generating critical CSS:', error);

    res.status(500).json({
      error: 'Failed to generate critical CSS',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint for generating critical CSS with external CSS file
app.post('/generate-critical-css-from-url', async (req, res) => {
  try {
    const { url, cssUrl, width = 1200, height = 800, timeout = 30000 } = req.body;

    if (!url) {
      return res.status(400).json({
        error: 'URL is required',
        message: 'Please provide a URL to generate critical CSS for'
      });
    }

    if (!cssUrl) {
      return res.status(400).json({
        error: 'CSS URL is required',
        message: 'Please provide a CSS URL to analyze'
      });
    }

    console.log(`Generating critical CSS for: ${url} with CSS from: ${cssUrl}`);

    // Ensure browser is available
    if (!browser) {
      await initializeBrowser();
      if (!browser) {
        throw new Error('Browser initialization failed');
      }
    }

    // Fetch CSS content from URL
    const cssResponse = await fetch(cssUrl);
    if (!cssResponse.ok) {
      throw new Error(`Failed to fetch CSS from ${cssUrl}: ${cssResponse.statusText}`);
    }
    const cssContent = await cssResponse.text();

    // Generate critical CSS using Playwright
    const criticalCss = await extractCriticalCSS(url, cssContent, {
      width: parseInt(width),
      height: parseInt(height),
      timeout: parseInt(timeout)
    });

    console.log(`Critical CSS generated successfully for: ${url}`);

    res.json({
      success: true,
      url: url,
      cssUrl: cssUrl,
      criticalCss: criticalCss,
      stats: {
        originalLength: cssContent.length,
        criticalLength: criticalCss.length,
        reductionPercent: Math.round((1 - criticalCss.length / cssContent.length) * 100)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error generating critical CSS:', error);

    res.status(500).json({
      error: 'Failed to generate critical CSS',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
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

// Error handling
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, async () => {
  console.log(`Critical CSS service running on port ${PORT}`);
  console.log(`Health check available at: http://localhost:${PORT}/health`);

  // Initialize browser on startup
  await initializeBrowser();
});

export default app;
