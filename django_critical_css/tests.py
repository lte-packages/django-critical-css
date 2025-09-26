from django.test import TestCase
from django.core.management import call_command
from django.io import StringIO
from .models import CriticalCSS


class ClearCriticalCSSCommandTest(TestCase):
    def setUp(self):
        # Create test critical CSS entries
        CriticalCSS.objects.create(
            url_pattern="/home/",
            css_content="body { margin: 0; }"
        )
        CriticalCSS.objects.create(
            url_pattern="/about/",
            css_content="h1 { color: red; }"
        )
    
    def test_clear_critical_css_with_no_confirm(self):
        """Test clearing all critical CSS with --no-confirm flag"""
        # Verify we have test data
        self.assertEqual(CriticalCSS.objects.count(), 2)
        
        # Run the command with --no-confirm
        out = StringIO()
        call_command('clear_critical_css', '--no-confirm', stdout=out)
        
        # Verify all entries were deleted
        self.assertEqual(CriticalCSS.objects.count(), 0)
        
        # Check success message
        self.assertIn('Successfully removed 2 critical CSS entries', out.getvalue())
    
    def test_clear_critical_css_no_entries(self):
        """Test the command when no critical CSS entries exist"""
        # Clear all entries first
        CriticalCSS.objects.all().delete()
        
        out = StringIO()
        call_command('clear_critical_css', '--no-confirm', stdout=out)
        
        # Check appropriate message
        self.assertIn('No critical CSS entries found to remove', out.getvalue())
    
    def test_command_help_text(self):
        """Test that command has proper help text"""
        out = StringIO()
        call_command('help', 'clear_critical_css', stdout=out)
        
        self.assertIn('Remove all stored critical CSS from the database', out.getvalue())