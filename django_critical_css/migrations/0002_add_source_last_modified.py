# Generated for django-critical-css

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('django_critical_css', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='criticalcss',
            name='source_last_modified',
            field=models.DateTimeField(blank=True, help_text='Last modified date from the source (e.g., sitemap)', null=True),
        ),
    ]
