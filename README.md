# django_critical_css

A Django app for managing and injecting critical CSS into your templates.

## Installation

```bash
pip install .
```

## Usage

Add `django_critical_css` to your `INSTALLED_APPS` in `settings.py`.

## Models

This app provides the `CriticalCSSCache` model for storing critical CSS for URLs:

```python
from django_critical_css.models import CriticalCSSCache

# Example usage:
entry = CriticalCSSCache.objects.create(
    url="https://example.com/page",
    css="body { background: #fff; }"
)

# Retrieve CSS for a URL
css = CriticalCSSCache.objects.get(url="https://example.com/page").css
```

Model fields:
- `url`: CharField, unique, max_length=500
- `css`: TextField
- `updated_at`: DateTimeField (auto-updated)

## Admin

You can register `CriticalCSSCache` in your `admin.py` to manage entries via the Django admin interface.
