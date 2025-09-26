from django.utils.deprecation import MiddlewareMixin
from django.core.cache import cache
import hashlib
from .models import CriticalCSSCache
from .tasks import enqueue_critical_css

class CriticalCSSMiddleware(MiddlewareMixin):
    """
    Middleware to check for stored critical CSS for the request path.
    If found, attaches it to `request.critical_css`.
    If not found, enqueues a background job.
    """

    def process_request(self, request):
        # Skip admin, static, and API endpoints
        if request.path.startswith("/admin") or request.path.startswith("/static") or request.path.startswith("/api"):
            return

        url = request.build_absolute_uri()
        cache_key = f"critical_css:{hashlib.md5(url.encode()).hexdigest()}"

        css = cache.get(cache_key)
        if not css:
            try:
                entry = CriticalCSSCache.objects.get(url=request.path)
                css = entry.css
                cache.set(cache_key, css, 3600)
            except CriticalCSSCache.DoesNotExist:
                # Queue background job — do not block request
                enqueue_critical_css.delay(url)

        # Attach to request object for template use
        request.critical_css = css or None
