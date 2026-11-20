# Use official Microsoft Playwright image with Node.js
FROM mcr.microsoft.com/playwright:v1.55.1-jammy

# Set working directory
WORKDIR /app

# Set environment variables for Playwright (browsers are pre-installed)
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy application code
COPY . .

# The official Playwright image already has a playwright user
# Change ownership of the app directory
RUN chown -R pwuser:pwuser /app
USER pwuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["npm", "start"]
