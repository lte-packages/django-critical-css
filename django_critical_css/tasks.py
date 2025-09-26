import requests
from celery import shared_task
from django.conf import settings

from .models import CriticalCSS


@shared_task
def enqueue_critical_css(url):
    """
    Call external Node.js service to generate critical CSS
    and store result in DB.
    """
    try:
        resp = requests.post(
            f"{settings.CRITICAL_CSS_SERVICE_URL}/generate-critical",
            json={"url": url},
            timeout=30,
        )
        resp.raise_for_status()
        css = resp.json().get("criticalCss", "")
        if css:
            CriticalCSS.objects.update_or_create(
                url_pattern=url, defaults={"css_content": css}
            )
    except Exception as e:
        # Log failure, but don't raise (avoid crashing Celery worker loop)
        import logging

        logger = logging.getLogger(__name__)
        logger.error("Critical CSS generation failed for %s: %s", url, e)
