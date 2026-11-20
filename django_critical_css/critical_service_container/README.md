# Critical CSS Service

A Node.js service that generates critical CSS using Penthouse and Playwright.
This service provides HTTP endpoints to extract above-the-fold CSS for faster
page loading.

## Features

- **Critical CSS Generation**: Extract above-the-fold CSS from any URL
- **Official Playwright Image**: Uses Microsoft's official Playwright Docker image with pre-installed browsers
- **Penthouse Engine**: Leverages the robust Penthouse library for CSS analysis
- **REST API**: Simple HTTP endpoints for integration
- **Docker Support**: Containerized for easy deployment using official Playwright image
- **Health Checks**: Built-in health monitoring
- **Security**: Helmet middleware and security best practices

## API Endpoints

### POST `/generate-critical-css`

Generate critical CSS from provided CSS string and URL.

**Request Body:**
```json
{
  "url": "https://example.com",
  "css": "body { margin: 0; } .hero { height: 100vh; }",
  "width": 1200,
  "height": 800,
  "timeout": 30000
}
```

**Response:**
```json
{
  "success": true,
  "url": "https://example.com",
  "criticalCss": ".hero { height: 100vh; }",
  "stats": {
    "originalLength": 45,
    "criticalLength": 23,
    "reductionPercent": 49
  },
  "timestamp": "2023-12-07T10:30:00.000Z"
}
```

### POST `/generate-critical-css-from-url`

Generate critical CSS from external CSS file URL.

**Request Body:**
```json
{
  "url": "https://example.com",
  "cssUrl": "https://example.com/styles.css",
  "width": 1200,
  "height": 800,
  "timeout": 30000
}
```

### GET `/health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2023-12-07T10:30:00.000Z",
  "browserReady": true
}
```

## Configuration

### Environment Variables

- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment mode (development/production)

### Request Parameters

- `url` (required): Target URL to analyze
- `css` or `cssUrl` (required): CSS content or URL to external CSS file
- `width` (optional): Viewport width in pixels (default: 1200)
- `height` (optional): Viewport height in pixels (default: 800)
- `timeout` (optional): Request timeout in milliseconds (default: 30000)

## Local Development

### Prerequisites

- Node.js 18+ (for local development)
- npm
- Docker (uses official Microsoft Playwright image)

### Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

The service will be available at `http://localhost:3000`.

## Docker Deployment

### Using Docker Compose (Recommended)

```bash
# Build and start the service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the service
docker-compose down
```

### Using Docker directly

```bash
# Build the image
docker build -t critical-css-service .

# Run the container
docker run -d \
  --name critical-css-service \
  -p 3000:3000 \
  critical-css-service
```

## Integration with Django

This service is designed to work with the `django-critical-css` package. You
can integrate it by:

1. Update your Django settings to point to this service:
```python
CRITICAL_CSS_SERVICE_URL = "http://critical-css-service:3000"
```

2. Modify the `generate_critical_css` method in your Django app to call this service:
```python
import requests

def generate_critical_css(url, css_content):
    response = requests.post(
        f"{CRITICAL_CSS_SERVICE_URL}/generate-critical-css",
        json={
            "url": url,
            "css": css_content,
            "width": 1200,
            "height": 800
        }
    )
    if response.status_code == 200:
        return response.json()["criticalCss"]
    else:
        raise Exception(f"Critical CSS generation failed: {response.text}")
```

## Performance Considerations

- The service reuses browser instances for better performance
- Uses official Microsoft Playwright Docker image for optimal browser configuration
- Memory and CPU limits can be adjusted in docker-compose.yml
- Consider implementing caching for frequently requested URLs

## Security

- Runs as non-root user in container
- Includes Helmet middleware for security headers
- Drops unnecessary Linux capabilities
- Uses tmpfs for temporary files
- CORS enabled for cross-origin requests

## Troubleshooting

### Browser Initialization Failed

If you see "Browser initialization failed" errors, this is much less likely with the official Playwright image, but here are solutions if issues persist:

#### 1. Increase Docker Memory Limits (if needed)

The official Playwright image should work with default settings, but you can still increase memory if needed:

```yaml
deploy:
  resources:
    limits:
      memory: 2G  # Increase if needed
    reservations:
      memory: 1G
```

#### 2. Use High-Memory Configuration

For heavy usage, you can still use the high-memory configuration:

```bash
./manage.sh start-hm
```

### Common Issues

1. **Browser fails to start**: With the official Playwright image, this should be rare. Check Docker logs if it occurs.
2. **Timeout errors**: Increase the timeout parameter for complex pages
3. **Permission errors**: The image uses 'pwuser' which should have proper permissions
4. **Network errors**: Ensure the target URLs are accessible from the container

### Memory Requirements

With the official Playwright image, memory requirements are more predictable:

- **Minimum**: 512MB RAM allocated to Docker
- **Recommended**: 1GB RAM for reliable operation
- **Heavy usage**: 2GB+ RAM for multiple concurrent requests

### Performance Optimization

For better performance with limited memory:

1. **Reduce concurrent requests**: Limit the number of simultaneous CSS generation requests
2. **Implement request queuing**: Process requests sequentially instead of in parallel
3. **Add caching**: Cache generated critical CSS to avoid repeated processing
4. **Monitor memory usage**: Set up alerts for memory usage spikes

### Logs

```bash
# Docker Compose
docker-compose logs critical-css-service

# Docker
docker logs critical-css-service
```

## License

This service is part of the django-critical-css package and follows the same license terms.
