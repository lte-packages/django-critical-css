# django_critical_css

A Django app for managing and injecting critical CSS into your templates.

## Installation

```bash
pip install .
```

## Usage

Add `django_critical_css` to your `INSTALLED_APPS` in `settings.py`.

### Management Commands

#### clear_critical_css

Remove all stored critical CSS from the database. This command can be useful for cache invalidation or when you want to refresh all critical CSS data.

```bash
# Interactive mode (with confirmation prompt)
python manage.py clear_critical_css

# Non-interactive mode (skip confirmation)
python manage.py clear_critical_css --no-confirm
```

The command will:
- Count and display the number of critical CSS entries
- Prompt for confirmation (unless `--no-confirm` is used)
- Remove all entries and display the count of removed items
- Handle the case when no entries exist gracefully

#### generate_critical_css

Generate critical CSS for URLs from a sitemap.xml file and store it in the database. This command reads sitemap URLs, compares last modified dates with cached CSS, and generates new CSS when needed.

```bash
# Basic usage with sitemap URL or file path
python manage.py generate_critical_css https://example.com/sitemap.xml

# Use local file
python manage.py generate_critical_css /path/to/sitemap.xml

# Dry run mode (show what would be processed without making changes)
python manage.py generate_critical_css sitemap.xml --dry-run

# Force regeneration regardless of last modified dates
python manage.py generate_critical_css sitemap.xml --force

# Process only first 10 URLs (useful for testing)
python manage.py generate_critical_css sitemap.xml --limit 10

# Combine options
python manage.py generate_critical_css sitemap.xml --dry-run --limit 5
```

**Features:**
- **Incremental updates**: Only processes URLs that have been modified since last generation
- **Sitemap parsing**: Supports standard sitemap.xml format with lastmod dates
- **Date comparison**: Compares sitemap lastmod with stored source_last_modified field
- **Flexible input**: Accepts both URLs and local file paths for sitemaps
- **Safety options**: Dry-run mode for testing, limit option for gradual processing
- **Force option**: Override date checks and regenerate all CSS

**Important Notes:**
- The current implementation includes a placeholder CSS generator that creates simple comment-based CSS
- In production, you would replace the `generate_critical_css` method with actual critical CSS extraction using tools like Puppeteer, Critical, or similar libraries
- The command stores the sitemap's lastmod date in the `source_last_modified` field for future comparisons
- URLs without lastmod dates in the sitemap are processed once and then skipped unless `--force` is used
