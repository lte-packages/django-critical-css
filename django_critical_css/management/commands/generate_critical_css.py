import xml.etree.ElementTree as ET
from datetime import datetime
from urllib.request import urlopen
from urllib.parse import urljoin, urlparse
import logging

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from django_critical_css.models import CriticalCSS


logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Generate critical CSS for URLs from sitemap.xml and store in database'
    
    def add_arguments(self, parser):
        parser.add_argument(
            'sitemap_url',
            type=str,
            help='URL or file path to the sitemap.xml file'
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force regeneration of all CSS regardless of last modified dates'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be processed without making changes'
        )
        parser.add_argument(
            '--limit',
            type=int,
            help='Limit the number of URLs to process (useful for testing)'
        )
    
    def handle(self, *args, **options):
        sitemap_url = options['sitemap_url']
        force = options['force']
        dry_run = options['dry_run']
        limit = options['limit']
        
        if dry_run:
            self.stdout.write(
                self.style.WARNING('Running in dry-run mode - no changes will be made')
            )
        
        try:
            # Parse the sitemap
            urls_data = self.parse_sitemap(sitemap_url)
            
            if not urls_data:
                self.stdout.write(
                    self.style.WARNING('No URLs found in sitemap')
                )
                return
            
            if limit:
                urls_data = urls_data[:limit]
                self.stdout.write(
                    self.style.WARNING(f'Processing limited to {limit} URLs')
                )
            
            processed = 0
            skipped = 0
            errors = 0
            
            for url_data in urls_data:
                url = url_data['loc']
                lastmod = url_data.get('lastmod')
                
                try:
                    if self.should_process_url(url, lastmod, force):
                        if not dry_run:
                            success = self.generate_critical_css(url, lastmod)
                            if success:
                                processed += 1
                            else:
                                errors += 1
                        else:
                            self.stdout.write(f'Would process: {url}')
                            processed += 1
                    else:
                        skipped += 1
                        self.stdout.write(f'Skipping (up to date): {url}')
                        
                except Exception as e:
                    errors += 1
                    self.stdout.write(
                        self.style.ERROR(f'Error processing {url}: {str(e)}')
                    )
                    logger.error(f'Error processing {url}', exc_info=True)
            
            # Summary
            self.stdout.write(
                self.style.SUCCESS(
                    f'Complete! Processed: {processed}, Skipped: {skipped}, Errors: {errors}'
                )
            )
            
        except Exception as e:
            raise CommandError(f'Failed to process sitemap: {str(e)}')
    
    def parse_sitemap(self, sitemap_url):
        """Parse sitemap.xml and extract URL data"""
        self.stdout.write(f'Parsing sitemap: {sitemap_url}')
        
        try:
            if sitemap_url.startswith(('http://', 'https://')):
                with urlopen(sitemap_url) as response:
                    content = response.read()
            else:
                with open(sitemap_url, 'rb') as f:
                    content = f.read()
            
            root = ET.fromstring(content)
            
            # Handle namespace
            namespaces = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
            
            urls_data = []
            for url_elem in root.findall('ns:url', namespaces):
                url_data = {}
                
                loc_elem = url_elem.find('ns:loc', namespaces)
                if loc_elem is not None:
                    url_data['loc'] = loc_elem.text
                    
                lastmod_elem = url_elem.find('ns:lastmod', namespaces)
                if lastmod_elem is not None:
                    url_data['lastmod'] = self.parse_lastmod(lastmod_elem.text)
                
                if 'loc' in url_data:
                    urls_data.append(url_data)
            
            self.stdout.write(f'Found {len(urls_data)} URLs in sitemap')
            return urls_data
            
        except ET.ParseError as e:
            raise CommandError(f'Failed to parse sitemap XML: {str(e)}')
        except Exception as e:
            raise CommandError(f'Failed to fetch/read sitemap: {str(e)}')
    
    def parse_lastmod(self, lastmod_str):
        """Parse lastmod date string to datetime object"""
        if not lastmod_str:
            return None
            
        # Handle various ISO formats
        formats = [
            '%Y-%m-%dT%H:%M:%S%z',   # Full ISO with timezone
            '%Y-%m-%dT%H:%M:%SZ',     # UTC format
            '%Y-%m-%dT%H:%M:%S',      # Without timezone
            '%Y-%m-%d',               # Date only
        ]
        
        for fmt in formats:
            try:
                dt = datetime.strptime(lastmod_str.strip(), fmt)
                if dt.tzinfo is None:
                    dt = timezone.make_aware(dt)
                return dt
            except ValueError:
                continue
        
        logger.warning(f'Could not parse lastmod date: {lastmod_str}')
        return None
    
    def should_process_url(self, url, lastmod, force):
        """Determine if URL should be processed based on lastmod date"""
        if force:
            return True
            
        try:
            existing = CriticalCSS.objects.get(url_pattern=url)
            
            # If no lastmod in sitemap but we have cached CSS, skip unless forced
            if not lastmod:
                return False
            
            # If cached CSS has no source_last_modified, process it
            if not existing.source_last_modified:
                return True
            
            # Process if source is newer than our cached version
            return lastmod > existing.source_last_modified
            
        except CriticalCSS.DoesNotExist:
            # New URL, always process
            return True
    
    def generate_critical_css(self, url, lastmod):
        """Generate critical CSS for a URL and store it in database"""
        self.stdout.write(f'Generating critical CSS for: {url}')
        
        try:
            # TODO: This is a placeholder - in a real implementation, you would:
            # 1. Fetch the webpage
            # 2. Use a tool like Puppeteer, Critical, or similar to extract critical CSS
            # 3. For now, we'll create a simple placeholder
            
            critical_css = f"/* Critical CSS for {url} generated at {timezone.now()} */"
            
            # Store or update the critical CSS
            css_obj, created = CriticalCSS.objects.update_or_create(
                url_pattern=url,
                defaults={
                    'css_content': critical_css,
                    'source_last_modified': lastmod,
                }
            )
            
            action = 'Created' if created else 'Updated'
            self.stdout.write(
                self.style.SUCCESS(f'{action} critical CSS for: {url}')
            )
            
            return True
            
        except Exception as e:
            logger.error(f'Failed to generate critical CSS for {url}', exc_info=True)
            self.stdout.write(
                self.style.ERROR(f'Failed to generate critical CSS for {url}: {str(e)}')
            )
            return False