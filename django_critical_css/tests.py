import os
import tempfile
from datetime import datetime, timedelta
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from .models import CriticalCSS


class ClearCriticalCSSCommandTest(TestCase):
    def setUp(self):
        # Create test critical CSS entries
        CriticalCSS.objects.create(
            url_pattern="/home/", css_content="body { margin: 0; }"
        )
        CriticalCSS.objects.create(
            url_pattern="/about/", css_content="h1 { color: red; }"
        )

    def test_clear_critical_css_with_no_confirm(self):
        """Test clearing all critical CSS with --no-confirm flag"""
        # Verify we have test data
        self.assertEqual(CriticalCSS.objects.count(), 2)

        # Run the command with --no-confirm
        out = StringIO()
        call_command("clear_critical_css", "--no-confirm", stdout=out)

        # Verify all entries were deleted
        self.assertEqual(CriticalCSS.objects.count(), 0)

        # Check success message
        self.assertIn("Successfully removed 2 critical CSS entries", out.getvalue())

    def test_clear_critical_css_no_entries(self):
        """Test the command when no critical CSS entries exist"""
        # Clear all entries first
        CriticalCSS.objects.all().delete()

        out = StringIO()
        call_command("clear_critical_css", "--no-confirm", stdout=out)

        # Check appropriate message
        self.assertIn("No critical CSS entries found to remove", out.getvalue())

    def test_command_help_text(self):
        """Test that command has proper help text"""
        from django_critical_css.management.commands.clear_critical_css import Command

        command = Command()
        self.assertEqual(
            command.help, "Remove all stored critical CSS from the database"
        )


class GenerateCriticalCSSCommandTest(TestCase):
    def setUp(self):
        # Create a test sitemap XML content
        self.sitemap_xml = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>https://example.com/</loc>
        <lastmod>2023-12-01T10:00:00Z</lastmod>
    </url>
    <url>
        <loc>https://example.com/about/</loc>
        <lastmod>2023-12-02T15:30:00Z</lastmod>
    </url>
    <url>
        <loc>https://example.com/contact/</loc>
    </url>
</urlset>"""

    def create_temp_sitemap(self):
        """Create a temporary sitemap file and return its path"""
        temp_file = tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False)
        temp_file.write(self.sitemap_xml)
        temp_file.close()
        return temp_file.name

    def test_parse_sitemap_basic(self):
        """Test basic sitemap parsing functionality"""
        from django_critical_css.management.commands.generate_critical_css import (
            Command,
        )

        command = Command()
        temp_sitemap = self.create_temp_sitemap()

        try:
            urls_data = command.parse_sitemap(temp_sitemap)

            self.assertEqual(len(urls_data), 3)
            self.assertEqual(urls_data[0]["loc"], "https://example.com/")
            self.assertIsNotNone(urls_data[0]["lastmod"])
            self.assertEqual(urls_data[2]["loc"], "https://example.com/contact/")
            self.assertNotIn("lastmod", urls_data[2])

        finally:
            os.unlink(temp_sitemap)

    def test_parse_lastmod_formats(self):
        """Test parsing of various lastmod date formats"""
        from django_critical_css.management.commands.generate_critical_css import (
            Command,
        )

        command = Command()

        # Test different date formats
        test_cases = [
            ("2023-12-01T10:00:00Z", True),
            ("2023-12-01T10:00:00+00:00", True),
            ("2023-12-01T10:00:00", True),
            ("2023-12-01", True),
            ("invalid-date", False),
            ("", False),
        ]

        for date_str, should_parse in test_cases:
            result = command.parse_lastmod(date_str)
            if should_parse:
                self.assertIsNotNone(result, f"Failed to parse valid date: {date_str}")
                self.assertIsInstance(result, datetime)
            else:
                self.assertIsNone(result, f"Should not parse invalid date: {date_str}")

    def test_should_process_url_new_url(self):
        """Test that new URLs are always processed"""
        from django_critical_css.management.commands.generate_critical_css import (
            Command,
        )

        command = Command()

        # New URL should always be processed
        should_process = command.should_process_url(
            "https://new.example.com/", None, False
        )
        self.assertTrue(should_process)

    def test_should_process_url_force(self):
        """Test that force flag processes all URLs"""
        from django_critical_css.management.commands.generate_critical_css import (
            Command,
        )

        # Create existing CSS entry
        CriticalCSS.objects.create(
            url_pattern="https://example.com/",
            css_content="body { margin: 0; }",
            source_last_modified=timezone.now(),
        )

        command = Command()

        # With force=True, should always process
        should_process = command.should_process_url("https://example.com/", None, True)
        self.assertTrue(should_process)

    def test_should_process_url_lastmod_comparison(self):
        """Test lastmod date comparison logic"""
        from django_critical_css.management.commands.generate_critical_css import (
            Command,
        )

        old_date = timezone.now() - timedelta(days=5)
        new_date = timezone.now() - timedelta(days=1)

        # Create existing CSS entry with old source date
        CriticalCSS.objects.create(
            url_pattern="https://example.com/",
            css_content="body { margin: 0; }",
            source_last_modified=old_date,
        )

        command = Command()

        # Newer source should be processed
        should_process = command.should_process_url(
            "https://example.com/", new_date, False
        )
        self.assertTrue(should_process)

        # Older source should not be processed
        very_old_date = timezone.now() - timedelta(days=10)
        should_process = command.should_process_url(
            "https://example.com/", very_old_date, False
        )
        self.assertFalse(should_process)

    def test_generate_critical_css_creates_entry(self):
        """Test that generate_critical_css creates database entries"""
        from django_critical_css.management.commands.generate_critical_css import (
            Command,
        )

        command = Command()
        test_url = "https://example.com/test/"
        test_date = timezone.now()

        # Should not exist initially
        self.assertFalse(CriticalCSS.objects.filter(url_pattern=test_url).exists())

        # Generate CSS
        success = command.generate_critical_css(test_url, test_date)
        self.assertTrue(success)

        # Should now exist
        css_obj = CriticalCSS.objects.get(url_pattern=test_url)
        self.assertIn("Critical CSS for https://example.com/test/", css_obj.css_content)
        self.assertEqual(css_obj.source_last_modified, test_date)

    def test_generate_critical_css_updates_entry(self):
        """Test that generate_critical_css updates existing entries"""
        from django_critical_css.management.commands.generate_critical_css import (
            Command,
        )

        test_url = "https://example.com/test/"
        old_date = timezone.now() - timedelta(days=1)
        new_date = timezone.now()

        # Create existing entry
        CriticalCSS.objects.create(
            url_pattern=test_url,
            css_content="old css content",
            source_last_modified=old_date,
        )

        command = Command()

        # Update CSS
        success = command.generate_critical_css(test_url, new_date)
        self.assertTrue(success)

        # Should be updated
        css_obj = CriticalCSS.objects.get(url_pattern=test_url)
        self.assertIn("Critical CSS for https://example.com/test/", css_obj.css_content)
        self.assertEqual(css_obj.source_last_modified, new_date)
        self.assertNotEqual(css_obj.css_content, "old css content")

    def test_command_dry_run(self):
        """Test dry-run mode doesn't make changes"""
        temp_sitemap = self.create_temp_sitemap()

        try:
            out = StringIO()
            call_command("generate_critical_css", temp_sitemap, "--dry-run", stdout=out)

            # No database entries should be created
            self.assertEqual(CriticalCSS.objects.count(), 0)

            # Should show what would be processed
            output = out.getvalue()
            self.assertIn("dry-run mode", output)
            self.assertIn("Would process:", output)

        finally:
            os.unlink(temp_sitemap)

    def test_command_limit(self):
        """Test limit functionality"""
        temp_sitemap = self.create_temp_sitemap()

        try:
            out = StringIO()
            call_command(
                "generate_critical_css", temp_sitemap, "--limit", "1", stdout=out
            )

            # Only one entry should be created
            self.assertEqual(CriticalCSS.objects.count(), 1)

            output = out.getvalue()
            self.assertIn("limited to 1 URLs", output)

        finally:
            os.unlink(temp_sitemap)

    def test_command_help_text(self):
        """Test that command has proper help text"""
        from django_critical_css.management.commands.generate_critical_css import (
            Command,
        )

        command = Command()
        self.assertEqual(
            command.help,
            "Generate critical CSS for URLs from sitemap.xml and store in database",
        )
