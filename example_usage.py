#!/usr/bin/env python3
"""
Example usage of the improved critical CSS extraction system.

This demonstrates how the new system can extract CSS rules based on:
- Classes (.btn, .card)
- IDs (#header, #footer)
- Elements (div, h1, p)
- Combinations (div.card, #header .navbar, .btn.primary)
"""

from django_critical_css.utils import (
    extract_critical_css_from_endpoint_response,
    extract_rules,
    extract_rules_legacy,
)


def example_comprehensive_extraction():
    """Example using the new comprehensive selector matching."""

    # Example CSS content
    css_content = """
    /* Reset styles */
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }

    /* Element styles */
    div { display: block; }
    h1 { font-size: 2em; font-weight: bold; }
    p { margin: 1em 0; }

    /* Class styles */
    .btn { padding: 10px 20px; border: none; }
    .btn.primary { background: blue; color: white; }
    .card { border: 1px solid #ccc; padding: 1em; }
    .navbar { background: #333; }

    /* ID styles */
    #header { background: white; height: 60px; }
    #footer { background: #333; color: white; }
    #main-content { max-width: 1200px; margin: 0 auto; }

    /* Combination styles */
    div.card { margin-bottom: 1em; }
    #header .navbar { color: white; }
    .btn:hover { opacity: 0.8; }

    /* Unused styles that shouldn't be included */
    .unused-class { display: none; }
    #unused-id { color: red; }
    """

    # Define what selectors we found above the fold
    wanted_selectors = {
        "classes": {"btn", "card", "navbar"},
        "ids": {"header", "main-content"},
        "elements": {"div", "h1", "html", "body"},
        "combinations": {"div.card", "#header .navbar", ".btn.primary", ".btn:hover"},
    }

    # Extract critical CSS
    critical_css = extract_rules(css_content, wanted_selectors)

    print("=== Comprehensive Critical CSS ===")
    print(critical_css)
    print(f"\nOriginal CSS: {len(css_content)} characters")
    print(f"Critical CSS: {len(critical_css)} characters")
    original_len = len(css_content)
    critical_len = len(critical_css)
    reduction = (original_len - critical_len) / original_len * 100
    print(f"Reduction: {reduction:.1f}%")


def example_legacy_extraction():
    """Example using the legacy classes-only approach."""

    css_content = """
    .btn { padding: 10px 20px; }
    .card { border: 1px solid #ccc; }
    .navbar { background: #333; }
    .unused { display: none; }
    """

    wanted_classes = {"btn", "card"}
    critical_css = extract_rules_legacy(css_content, wanted_classes)

    print("\n=== Legacy Classes-Only Critical CSS ===")
    print(critical_css)


def example_endpoint_integration():
    """Example showing how to integrate with the Node.js endpoint."""

    # Simulate endpoint response
    endpoint_response = {
        "success": True,
        "url": "https://example.com",
        "wantedSelectors": {
            "classes": ["btn", "card", "navbar"],
            "ids": ["header", "main-content"],
            "elements": ["div", "h1", "html", "body"],
            "combinations": ["div.card", "#header .navbar", ".btn.primary"],
        },
        "stats": {
            "totalElements": 25,
            "totalClasses": 3,
            "totalIds": 2,
            "totalElementTypes": 4,
            "totalCombinations": 3,
        },
    }

    css_content = """
    html, body { margin: 0; }
    div { display: block; }
    h1 { font-size: 2em; }
    .btn { padding: 10px; }
    .btn.primary { background: blue; }
    .card { border: 1px solid #ccc; }
    .navbar { background: #333; }
    #header { height: 60px; }
    #main-content { max-width: 1200px; }
    div.card { margin-bottom: 1em; }
    #header .navbar { color: white; }
    .unused { display: none; }
    """

    critical_css = extract_critical_css_from_endpoint_response(
        css_content, endpoint_response
    )

    print("\n=== Endpoint Integration Critical CSS ===")
    print(critical_css)


if __name__ == "__main__":
    print("Django Critical CSS - Improved Extraction Examples")
    print("=" * 50)

    example_comprehensive_extraction()
    example_legacy_extraction()
    example_endpoint_integration()

    print("\n" + "=" * 50)
    print("Complete! The new system can now extract CSS rules based on:")
    print("- Classes: .btn, .card")
    print("- IDs: #header, #footer")
    print("- Elements: div, h1, p")
    print("- Combinations: div.card, #header .navbar, .btn:hover")
    print("- Universal selectors: *, html, body, :root")
