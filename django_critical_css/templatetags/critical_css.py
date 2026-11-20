from django import template

register = template.Library()


@register.simple_tag(takes_context=True)
def critical_css(context):
    """
    Inject critical CSS if available.
    """
    request = context.get("request")
    if hasattr(request, "critical_css") and request.critical_css:
        return f"<style>{request.critical_css}</style>"
    return ""
