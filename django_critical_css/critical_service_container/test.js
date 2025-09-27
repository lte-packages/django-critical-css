#!/usr/bin/env node

import http from 'http';

const SERVICE_URL = 'http://localhost:3000';

// Test data
const testCss = `
body {
  margin: 0;
  padding: 0;
  font-family: Arial, sans-serif;
}

.hero {
  height: 100vh;
  background: linear-gradient(45deg, #FF6B6B, #4ECDC4);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 3rem;
}

.content {
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.footer {
  background: #333;
  color: white;
  padding: 2rem;
  text-align: center;
}

/* This CSS won't be critical as it's below the fold */
.below-fold {
  margin-top: 2000px;
  padding: 2rem;
  background: #f0f0f0;
}
`;

const testUrl = 'https://example.com';

// Helper function to make HTTP requests
function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function testHealthCheck() {
  console.log('🏥 Testing health check...');

  try {
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/health',
      method: 'GET'
    });

    if (response.status === 200) {
      console.log('✅ Health check passed:', response.data);
      return true;
    } else {
      console.log('❌ Health check failed:', response.status, response.data);
      return false;
    }
  } catch (error) {
    console.log('❌ Health check error:', error.message);
    return false;
  }
}

async function testCriticalCssGeneration() {
  console.log('🎨 Testing critical CSS generation...');

  try {
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/generate-critical-css',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, {
      url: testUrl,
      css: testCss,
      width: 1200,
      height: 800
    });

    if (response.status === 200 && response.data.success) {
      console.log('✅ Critical CSS generation successful!');
      console.log('📊 Stats:', response.data.stats);
      console.log('🎯 Critical CSS preview:', response.data.criticalCss.substring(0, 200) + '...');
      return true;
    } else {
      console.log('❌ Critical CSS generation failed:', response.status, response.data);
      return false;
    }
  } catch (error) {
    console.log('❌ Critical CSS generation error:', error.message);
    return false;
  }
}

async function testErrorHandling() {
  console.log('🚨 Testing error handling...');

  try {
    // Test missing URL
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/generate-critical-css',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, {
      css: testCss
      // Missing URL
    });

    if (response.status === 400) {
      console.log('✅ Error handling working correctly:', response.data.error);
      return true;
    } else {
      console.log('❌ Expected 400 error but got:', response.status, response.data);
      return false;
    }
  } catch (error) {
    console.log('❌ Error handling test failed:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting Critical CSS Service Tests\n');

  const tests = [
    { name: 'Health Check', fn: testHealthCheck },
    { name: 'Critical CSS Generation', fn: testCriticalCssGeneration },
    { name: 'Error Handling', fn: testErrorHandling }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    console.log(`\n--- ${test.name} ---`);
    try {
      const result = await test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name} failed with error:`, error.message);
      failed++;
    }
  }

  console.log('\n📈 Test Results:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${passed + failed}`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n💥 Some tests failed!');
    process.exit(1);
  }
}

// Wait a bit for the server to start if running in CI
setTimeout(runTests, 2000);
