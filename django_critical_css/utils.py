import re

import cssutils


def extract_rules(css_file, wanted_classes):
    """
    Example usage
    wanted = {"btn", "card", "title"}
    print(extract_rules("styles.css", wanted))

    """
    sheet = cssutils.parseFile(css_file)
    output = cssutils.css.CSSStyleSheet()

    # Precompile regex for efficiency
    patterns = [re.compile(rf"\.{cls}(\b|:|::|$)") for cls in wanted_classes]

    def rule_matches(rule):
        return any(p.search(rule.selectorText) for p in patterns)

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
