from django.db import models


class CriticalCSS(models.Model):
    """Model to store critical CSS for different pages/routes."""
    
    url_pattern = models.CharField(max_length=255, unique=True, help_text="URL pattern or route name")
    css_content = models.TextField(help_text="Critical CSS content to inline")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = "Critical CSS"
        verbose_name_plural = "Critical CSS"
    
    def __str__(self):
        return f"Critical CSS for {self.url_pattern}"