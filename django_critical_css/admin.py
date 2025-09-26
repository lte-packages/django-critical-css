from django.contrib import admin
from .models import CriticalCSS


@admin.register(CriticalCSS)
class CriticalCSSAdmin(admin.ModelAdmin):
    list_display = ('url_pattern', 'source_last_modified', 'created_at', 'updated_at')
    list_filter = ('created_at', 'updated_at', 'source_last_modified')
    search_fields = ('url_pattern',)
    readonly_fields = ('created_at', 'updated_at')
    fields = ('url_pattern', 'css_content', 'source_last_modified', 'created_at', 'updated_at')