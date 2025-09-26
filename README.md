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
