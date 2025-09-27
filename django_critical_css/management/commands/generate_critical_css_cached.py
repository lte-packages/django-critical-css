import logging
import xml.etree.ElementTree as ElementTree
from datetime import datetime
from urllib.parse import urlparse
from urllib.request import urlopen

import requests
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from django_critical_css.models import CriticalCSS

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Generate critical CSS using cached service"

    def add_arguments(self, parser):
        parser.add_argument(
            "sitemap_url", type=str, help="URL or file path to the sitemap.xml file"
        )
        parser.add_argument(
            "--css-url", type=str, help="URL of main CSS file (cached and reused)"
        )
        parser.add_argument(
            "--service-url",
            type=str,
            default="http://localhost:3000",
            help="URL of critical CSS service",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Force regeneration of all CSS regardless of last modified dates",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be processed without making changes",
        )
        parser.add_argument(
            "--limit",
            type=int,
            help="Limit the number of URLs to process (useful for testing)",
        )
        parser.add_argument(
            "--width",
            type=int,
            default=1200,
            help="Viewport width for critical CSS generation (default: 1200)",
        )
        parser.add_argument(
            "--height",
            type=int,
            default=800,
            help="Viewport height for critical CSS generation (default: 800)",
        )
        parser.add_argument(
            "--clear-cache",
            action="store_true",
            help="Clear the CSS cache before starting",
        )
        parser.add_argument(
            "--show-cache-stats",
            action="store_true",
            help="Show cache statistics at the end",
        )

    def handle(self, *args, **options):
        sitemap_url = options["sitemap_url"]
        css_url = options["css_url"]
        service_url = options["service_url"].rstrip("/")
        force = options["force"]
        dry_run = options["dry_run"]
        limit = options["limit"]
        width = options["width"]
        height = options["height"]
        clear_cache = options["clear_cache"]
        show_cache_stats = options["show_cache_stats"]

        if dry_run:
            self.stdout.write(
                self.style.WARNING("Running in dry-run mode - no changes will be made")
            )

        # Check if service is available
        if not self.check_service_health(service_url):
            raise CommandError(f"Critical CSS service not available at {service_url}")

        # Clear cache if requested
        if clear_cache:
            self.clear_service_cache(service_url)

        try:
            # Parse the sitemap
            urls_data = self.parse_sitemap(sitemap_url)

            if not urls_data:
                self.stdout.write(self.style.WARNING("No URLs found in sitemap"))
                return

            if limit:
                urls_data = urls_data[:limit]
                self.stdout.write(
                    self.style.WARNING(f"Processing limited to {limit} URLs")
                )

            processed = 0
            skipped = 0
            errors = 0
            cache_hits = 0

            self.stdout.write(f"Processing {len(urls_data)} URLs...")
            if css_url:
                self.stdout.write(
                    f"Using CSS: {css_url} (will be cached after first use)"
                )

            start_time = timezone.now()

            for i, url_data in enumerate(urls_data, 1):
                url = url_data["loc"]
                lastmod = url_data.get("lastmod")

                self.stdout.write(f"[{i}/{len(urls_data)}] Processing: {url}")

                try:
                    if self.should_process_url(url, lastmod, force):
                        if not dry_run:
                            result = self.generate_critical_css_cached(
                                url, css_url, service_url, width, height, lastmod
                            )
                            if result["success"]:
                                processed += 1
                                if result.get("cache_hit"):
                                    cache_hits += 1
                            else:
                                errors += 1
                        else:
                            self.stdout.write(f"Would process: {url}")
                            processed += 1
                    else:
                        skipped += 1
                        self.stdout.write(f"Skipping (up to date): {url}")

                except Exception as e:
                    errors += 1
                    self.stdout.write(
                        self.style.ERROR(f"Error processing {url}: {e!s}")
                    )
                    logger.error(f"Error processing {url}", exc_info=True)

            # Summary
            end_time = timezone.now()
            duration = (end_time - start_time).total_seconds()

            self.stdout.write(
                self.style.SUCCESS(
                    f"\n=== SUMMARY ===\n"
                    f"Total time: {duration:.1f} seconds\n"
                    f"Processed: {processed}\n"
                    f"Skipped: {skipped}\n"
                    f"Errors: {errors}\n"
                    f"Cache hits: {cache_hits}/{processed} ({cache_hits/processed*100 if processed > 0 else 0:.1f}%)"
                )
            )

            # Show cache statistics
            if show_cache_stats:
                self.show_service_cache_stats(service_url)

        except Exception as e:
            raise CommandError(f"Failed to process sitemap: {e!s}") from e

    def check_service_health(self, service_url):
        """Check if the critical CSS service is available"""
        try:
            response = requests.get(f"{service_url}/health", timeout=10)
            if response.status_code == 200:
                data = response.json()
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Service available with features: {', '.join(data.get('features', []))}"
                    )
                )
                return True
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Service health check failed: {e!s}"))
        return False

    def clear_service_cache(self, service_url):
        """Clear the service cache"""
        try:
            response = requests.delete(f"{service_url}/cache/clear", timeout=10)
            if response.status_code == 200:
                data = response.json()
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Cache cleared: {data['cleared']['memoryEntries']} memory entries, "
                        f"{data['cleared']['diskFiles']} disk files"
                    )
                )
            else:
                self.stdout.write(self.style.WARNING("Failed to clear cache"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Failed to clear cache: {e!s}"))

    def show_service_cache_stats(self, service_url):
        """Show cache statistics"""
        try:
            response = requests.get(f"{service_url}/cache/stats", timeout=10)
            if response.status_code == 200:
                data = response.json()
                stats = data["stats"]
                memory = data["memory"]

                self.stdout.write(
                    self.style.SUCCESS(
                        f"\n=== CACHE STATISTICS ===\n"
                        f"Total requests: {stats['totalRequests']}\n"
                        f"Memory hits: {stats['memoryHits']}\n"
                        f"Disk hits: {stats['diskHits']}\n"
                        f"Cache misses: {stats['misses']}\n"
                        f"Downloads: {stats['downloads']}\n"
                        f"Hit rate: {((stats['memoryHits'] + stats['diskHits']) / stats['totalRequests'] * 100) if stats['totalRequests'] > 0 else 0:.1f}%\n"
                        f"Memory cache: {memory['entries']} entries, {memory['totalSize'] / 1024 / 1024:.1f} MB"
                    )
                )
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Failed to get cache stats: {e!s}"))

    def generate_critical_css_cached(
        self, url, css_url, service_url, width, height, lastmod
    ):
        """Generate critical CSS using the cached service"""
        try:
            payload = {
                "url": url,
                "width": width,
                "height": height,
                "timeout": 30000,
            }

            # Add CSS URL if provided
            if css_url:
                payload["cssUrl"] = css_url
            else:
                # If no CSS URL provided, try to extract from page
                payload["extractPageCSS"] = True

            response = requests.post(
                f"{service_url}/generate-critical-css-cached",
                json=payload,
                timeout=60,  # Generous timeout for first request
            )

            if response.status_code == 200:
                data = response.json()

                if data.get("success"):
                    critical_css = data["criticalCss"]
                    stats = data["stats"]
                    cache_info = data.get("cacheInfo", {})

                    # Store in database
                    css_obj, created = CriticalCSS.objects.update_or_create(
                        url_pattern=url,
                        defaults={
                            "css_content": critical_css,
                            "source_last_modified": lastmod,
                        },
                    )

                    action = "Created" if created else "Updated"
                    cache_status = "cache" if cache_info.get("used") else "network"

                    self.stdout.write(
                        self.style.SUCCESS(
                            f"{action} critical CSS for {url} "
                            f"({stats['criticalLength']} bytes, "
                            f"{stats['reductionPercent']}% reduction, "
                            f"from {cache_status})"
                        )
                    )

                    return {"success": True, "cache_hit": cache_info.get("used", False)}
                else:
                    self.stdout.write(
                        self.style.ERROR(
                            f"Service returned error: {data.get('message', 'Unknown error')}"
                        )
                    )
                    return {"success": False}
            else:
                self.stdout.write(
                    self.style.ERROR(f"HTTP {response.status_code}: {response.text}")
                )
                return {"success": False}

        except requests.RequestException as e:
            self.stdout.write(self.style.ERROR(f"Request failed: {e!s}"))
            return {"success": False}
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Unexpected error: {e!s}"))
            return {"success": False}

    def parse_sitemap(self, sitemap_url):
        """Parse sitemap.xml and extract URL data"""
        self.stdout.write(f"Parsing sitemap: {sitemap_url}")

        try:
            if sitemap_url.startswith(("http://", "https://")):
                # Validate URL scheme for security
                parsed = urlparse(sitemap_url)
                if parsed.scheme not in ("http", "https"):
                    raise CommandError(f"Invalid URL scheme: {parsed.scheme}")

                with urlopen(sitemap_url) as response:  # noqa: S310
                    content = response.read()
            else:
                with open(sitemap_url, "rb") as f:
                    content = f.read()

            # Parse XML content - sitemap.xml is expected to be trusted content
            root = ElementTree.fromstring(content)  # noqa: S314

            # Handle namespace
            namespaces = {"ns": "http://www.sitemaps.org/schemas/sitemap/0.9"}

            urls_data = []
            for url_elem in root.findall("ns:url", namespaces):
                url_data = {}

                loc_elem = url_elem.find("ns:loc", namespaces)
                if loc_elem is not None:
                    url_data["loc"] = loc_elem.text

                lastmod_elem = url_elem.find("ns:lastmod", namespaces)
                if lastmod_elem is not None:
                    url_data["lastmod"] = self.parse_lastmod(lastmod_elem.text)

                if "loc" in url_data:
                    urls_data.append(url_data)

            self.stdout.write(f"Found {len(urls_data)} URLs in sitemap")
            return urls_data

        except ElementTree.ParseError as e:
            raise CommandError(f"Failed to parse sitemap XML: {e!s}") from e
        except Exception as e:
            raise CommandError(f"Failed to fetch/read sitemap: {e!s}") from e

    def parse_lastmod(self, lastmod_str):
        """Parse lastmod date string to datetime object"""
        if not lastmod_str:
            return None

        # Handle various ISO formats
        formats = [
            "%Y-%m-%dT%H:%M:%S%z",  # Full ISO with timezone
            "%Y-%m-%dT%H:%M:%SZ",  # UTC format
            "%Y-%m-%dT%H:%M:%S",  # Without timezone
            "%Y-%m-%d",  # Date only
        ]

        for fmt in formats:
            try:
                dt = datetime.strptime(lastmod_str.strip(), fmt)
                if dt.tzinfo is None:
                    dt = timezone.make_aware(dt)
                return dt
            except ValueError:
                continue

        logger.warning(f"Could not parse lastmod date: {lastmod_str}")
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
