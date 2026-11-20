#!/bin/bash

# Critical CSS Service Management Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Help function
show_help() {
    echo "Critical CSS Service Management Script"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  build     - Build the Docker image"
    echo "  start     - Start the service using docker-compose"
    echo "  start-hm  - Start with high-memory configuration"
    echo "  dev       - Start the service in development mode"
    echo "  stop      - Stop the service"
    echo "  restart   - Restart the service"
    echo "  logs      - Show service logs"
    echo "  test      - Run the test suite"
    echo "  health    - Check service health"
    echo "  stats     - Show container resource usage"
    echo "  clean     - Clean up containers and images"
    echo "  help      - Show this help message"
    echo ""
}

# Build function
build() {
    log_info "Building Critical CSS Service..."
    docker-compose build
    log_success "Build completed!"
}

# Start function
start() {
    log_info "Starting Critical CSS Service..."
    docker-compose up -d
    log_success "Service started! Available at http://localhost:3000"
    log_info "Run '$0 health' to check if the service is ready"
}

# Start with high memory function
start_high_mem() {
    log_info "Starting Critical CSS Service with high-memory configuration..."
    docker-compose -f docker-compose.high-mem.yml up -d
    log_success "High-memory service started! Available at http://localhost:3000"
    log_info "Run '$0 health' to check if the service is ready"
}

# Development function
dev() {
    log_info "Starting Critical CSS Service in development mode..."
    docker-compose -f docker-compose.dev.yml up --build
}

# Stop function
stop() {
    log_info "Stopping Critical CSS Service..."
    docker-compose down
    log_success "Service stopped!"
}

# Restart function
restart() {
    log_info "Restarting Critical CSS Service..."
    docker-compose restart
    log_success "Service restarted!"
}

# Logs function
logs() {
    log_info "Showing Critical CSS Service logs..."
    docker-compose logs -f critical-css-service
}

# Test function
test() {
    log_info "Running tests..."

    # Check if service is running
    if ! docker-compose ps | grep -q "critical-css-service.*Up"; then
        log_info "Service not running, starting it first..."
        start
        sleep 10
    fi

    log_info "Waiting for service to be ready..."
    sleep 5

    # Run the test script
    if node test.js; then
        log_success "All tests passed!"
    else
        log_error "Some tests failed!"
        exit 1
    fi
}

# Health check function
health() {
    log_info "Checking service health..."

    response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>/dev/null || echo "000")

    if [ "$response" = "200" ]; then
        log_success "Service is healthy!"
        # Get detailed health info
        curl -s http://localhost:3000/health | python3 -m json.tool
    else
        log_error "Service is not healthy (HTTP $response)"
        exit 1
    fi
}

# Clean function
clean() {
    log_info "Cleaning up containers and images..."
    docker-compose down --rmi all --volumes --remove-orphans
    docker-compose -f docker-compose.high-mem.yml down --rmi all --volumes --remove-orphans 2>/dev/null || true
    log_success "Cleanup completed!"
}

# Stats function
stats() {
    log_info "Container resource usage:"
    if docker ps --format "table {{.Names}}" | grep -q "critical-css-service"; then
        docker stats --no-stream $(docker ps --format "{{.Names}}" | grep "critical-css-service")
    else
        log_error "No running critical-css-service containers found"
    fi
}

# Main logic
case "${1:-help}" in
    build)
        build
        ;;
    start)
        start
        ;;
    start-hm)
        start_high_mem
        ;;
    dev)
        dev
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    logs)
        logs
        ;;
    test)
        test
        ;;
    health)
        health
        ;;
    stats)
        stats
        ;;
    clean)
        clean
        ;;
    help|*)
        show_help
        ;;
esac
