# Development Tasks
.PHONY: help install install-dev lint format test clean pre-commit

help:  ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install:  ## Install production dependencies
	pip install -e .

install-dev:  ## Install development dependencies
	pip install -e ".[dev]"
	pre-commit install

lint:  ## Run linting with ruff
	ruff check .

format:  ## Format code with ruff
	ruff format .
	ruff check --fix .

test:  ## Run tests with pytest
	pytest

test-cov:  ## Run tests with coverage
	pytest --cov=django_critical_css --cov-report=html --cov-report=term-missing

clean:  ## Clean up build artifacts
	rm -rf build/
	rm -rf dist/
	rm -rf *.egg-info/
	rm -rf htmlcov/
	rm -rf .coverage
	find . -type d -name __pycache__ -delete
	find . -type f -name "*.pyc" -delete

pre-commit:  ## Run pre-commit hooks on all files
	pre-commit run --all-files

build:  ## Build the package
	python -m build

release:  ## Build and upload to PyPI (requires proper credentials)
	python -m build
	python -m twine upload dist/*
