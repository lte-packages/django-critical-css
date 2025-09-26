from django.db import models

# Create your models here.

from django.db import models

class CriticalCSSCache(models.Model):
    url = models.CharField(max_length=500, unique=True)
    css = models.TextField()
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"CriticalCSS({self.url})"
