import re

import cssutils


def extract_rules(css_file, wanted_selectors):
    """
    Extract CSS rules that match any of the wanted selectors.

    Args:
        css_file: Path to CSS file or CSS content string
        wanted_selectors: dict with keys: 'classes', 'ids', 'elements',
                         'combinations'
                         Example: {
                             'classes': {'btn', 'card', 'title'},
                             'ids': {'header', 'main-content'},
                             'elements': {'div', 'p', 'h1'},
                             'combinations': {'div.card', '#header .navbar',
                                            '.btn.primary'}
                         }

    Example usage:
    wanted = {
        'classes': {'btn', 'card', 'title'},
        'ids': {'header', 'footer'},
        'elements': {'body', 'html', 'h1'},
        'combinations': {'div.card', '.btn:hover'}
    }
    print(extract_rules("styles.css", wanted))
    """
    # Handle both file path and CSS content string
    if css_file.endswith(".css") or "/" in css_file:
        sheet = cssutils.parseFile(css_file)
    else:
        sheet = cssutils.parseString(css_file)

    output = cssutils.css.CSSStyleSheet()

    # Build regex patterns for different selector types
    patterns = []

    # Class patterns
    if wanted_selectors.get("classes"):
        for cls in wanted_selectors["classes"]:
            # Match .classname with word boundary or pseudo-selectors
            pattern = rf"\.{re.escape(cls)}(\b|:|::|$|\s|,|\+|~|>)"
            patterns.append(re.compile(pattern))

    # ID patterns
    if wanted_selectors.get("ids"):
        for id_name in wanted_selectors["ids"]:
            # Match #idname with word boundary or pseudo-selectors
            pattern = rf"#{re.escape(id_name)}(\b|:|::|$|\s|,|\+|~|>)"
            patterns.append(re.compile(pattern))

    # Element patterns
    if wanted_selectors.get("elements"):
        for element in wanted_selectors["elements"]:
            # Match element name at word boundaries
            pattern = rf"\b{re.escape(element)}" rf"(\b|:|::|$|\s|,|\+|~|>|\.|\[|#)"
            patterns.append(re.compile(pattern))

    # Exact combination patterns
    if wanted_selectors.get("combinations"):
        for combination in wanted_selectors["combinations"]:
            # Escape the combination and match exactly
            escaped = re.escape(combination).replace(r"\ ", r"\s*")
            patterns.append(re.compile(rf"\b{escaped}(\b|:|::|$|\s|,|\+|~|>)"))

    def rule_matches(rule):
        selector_text = rule.selectorText
        if not selector_text:
            return False

        # Check if any pattern matches
        for pattern in patterns:
            if pattern.search(selector_text):
                return True

        # Also include universal selectors and CSS resets that are critical
        critical_selectors = ["*", "html", "body", ":root"]
        return any(critical in selector_text for critical in critical_selectors)

    def process_container(container):
        new_container = None
        for r in container.cssRules:
            if r.type == r.STYLE_RULE and rule_matches(r):
                if new_container is None:
                    # Create same type of container
                    if container.type == container.MEDIA_RULE:
                        new_container = cssutils.css.CSSMediaRule(
                            mediaText=container.media.mediaText
                        )
                    elif container.type == container.SUPPORTS_RULE:
                        new_container = cssutils.css.CSSSupportsRule(
                            conditionText=container.conditionText
                        )
                new_container.add(r)
            elif r.type in (r.MEDIA_RULE, r.SUPPORTS_RULE):
                nested = process_container(r)
                if nested:
                    if new_container is None:
                        if container.type == container.MEDIA_RULE:
                            new_container = cssutils.css.CSSMediaRule(
                                mediaText=container.media.mediaText
                            )
                        elif container.type == container.SUPPORTS_RULE:
                            new_container = cssutils.css.CSSSupportsRule(
                                conditionText=container.conditionText
                            )
                    new_container.add(nested)
        return new_container

    for rule in sheet:
        if rule.type == rule.STYLE_RULE and rule_matches(rule):
            output.add(rule)
        elif rule.type in (rule.MEDIA_RULE, rule.SUPPORTS_RULE):
            nested = process_container(rule)
            if nested:
                output.add(nested)

    return output.cssText.decode("utf-8")


def extract_rules_legacy(css_file, wanted_classes):
    """
    Legacy function for backward compatibility.
    Only extracts rules based on CSS classes.

    Example usage
    wanted = {"btn", "card", "title"}
    print(extract_rules_legacy("styles.css", wanted))
    """
    wanted_selectors = {"classes": wanted_classes}
    return extract_rules(css_file, wanted_selectors)


def extract_critical_css_from_endpoint_response(css_file, endpoint_response):
    """
    Helper function to extract critical CSS using response from
    /get-above-fold-elements endpoint.

    Args:
        css_file: Path to CSS file or CSS content string
        endpoint_response: Response dict from /get-above-fold-elements endpoint

    Example usage:
    import requests
    response = requests.post('http://localhost:3000/get-above-fold-elements',
                           json={'url': 'https://example.com'})
    critical_css = extract_critical_css_from_endpoint_response(
        'styles.css',
        response.json()
    )
    """
    if not endpoint_response.get("success", False):
        raise ValueError("Endpoint response indicates failure")

    # Use the comprehensive selector information if available
    if "wantedSelectors" in endpoint_response:
        wanted_selectors = endpoint_response["wantedSelectors"]
        # Convert lists back to sets for the extract_rules function
        wanted_selectors = {
            key: set(value) if isinstance(value, list) else value
            for key, value in wanted_selectors.items()
        }
    else:
        # Fallback to legacy classes-only approach
        wanted_classes = set(endpoint_response.get("wantedClasses", []))
        wanted_selectors = {"classes": wanted_classes}

    return extract_rules(css_file, wanted_selectors)
