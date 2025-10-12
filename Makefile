# Development Tasks
.PHONY: help install install-dev lint format test clean pre-commit

# Define variables
PACKAGE_NAME = django_critical_css

# read variables from .env if it exists
ifneq (,$(wildcard .env))
	include .env
	export $(shell sed 's/=.*//' .env)
endif

# check if a python virtual environment is activated
ifneq (,$(VIRTUAL_ENV))
	PYTHON = $(VIRTUAL_ENV)/bin/python
endif

# redefine PYTHON if PYTHON_PATH is set in .env
# or fallback to .venv/bin/python
ifneq (,$(PYTHON_PATH))
	PYTHON = $(PYTHON_PATH)
else
	PYTHON = .venv/bin/python
endif

help:  ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install:  ## Install production dependencies
	$(PYTHON) -m pip install -e .

install-dev:  ## Install development dependencies
	$(PYTHON) -m pip install -e ".[dev]"
	$(PYTHON) -m pre_commit install

lint:  ## Ensure ruff is installed and run linting with ruff
	$(PYTHON) -m pip install --quiet ruff
	$(PYTHON) -m ruff check .

format:  ## Format code with ruff
	$(PYTHON) -m ruff format .
	$(PYTHON) -m ruff check --fix .

test:  ## Run tests with pytest
	$(PYTHON) -m pytest

test-cov:  ## Run tests with coverage
	$(PYTHON) -m pytest --cov=django_critical_css --cov-report=html --cov-report=term-missing

clean:  ## Clean up build artifacts
	rm -rf build/
	rm -rf dist/
	rm -rf *.egg-info/
	rm -rf htmlcov/
	rm -rf .coverage
	find . -type d -name __pycache__ -delete
	find . -type f -name "*.pyc" -delete

pre-commit:  ## Run pre-commit hooks on all files
	$(PYTHON) -m pre_commit run --all-files

build:  ## Build the package
	$(PYTHON) -m build

release:  ## Build and upload to PyPI (requires proper credentials)
	$(PYTHON) -m build
	$(PYTHON) -m twine upload dist/*
