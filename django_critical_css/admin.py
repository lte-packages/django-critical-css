from django.contrib import admin
from .models import CriticalCSS


@admin.register(CriticalCSS)
class CriticalCSSAdmin(admin.ModelAdmin):
    list_display = ('url_pattern', 'created_at', 'updated_at')
    list_filter = ('created_at', 'updated_at')
    search_fields = ('url_pattern',)
    readonly_fields = ('created_at', 'updated_at')