import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import penthouse from 'penthouse';
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

    // Generate critical CSS using Penthouse
    const criticalCss = await penthouse({
      url: url,
      cssString: css,
      width: parseInt(width),
      height: parseInt(height),
      timeout: parseInt(timeout),
      puppeteer: {
        getBrowser: () => browser
      },
      forceInclude: [
        // Common critical selectors that should always be included
        '.critical',
        '[critical]',
        /\.hero/,
        /\.header/,
        /\.navbar/,
        /\.menu/
      ],
      propertiesToRemove: [
        '(-webkit-)?transform',
        'perspective',
        'backface-visibility'
      ],
      keepLargerMediaQueries: false,
      strict: false
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

    // Generate critical CSS using Penthouse
    const criticalCss = await penthouse({
      url: url,
      css: cssUrl,
      width: parseInt(width),
      height: parseInt(height),
      timeout: parseInt(timeout),
      puppeteer: {
        getBrowser: () => browser
      },
      forceInclude: [
        '.critical',
        '[critical]',
        /\.hero/,
        /\.header/,
        /\.navbar/,
        /\.menu/
      ],
      propertiesToRemove: [
        '(-webkit-)?transform',
        'perspective',
        'backface-visibility'
      ],
      keepLargerMediaQueries: false,
      strict: false
    });

    console.log(`Critical CSS generated successfully for: ${url}`);

    res.json({
      success: true,
      url: url,
      cssUrl: cssUrl,
      criticalCss: criticalCss,
      stats: {
        criticalLength: criticalCss.length
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
