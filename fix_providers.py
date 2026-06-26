#!/usr/bin/env python3
"""Fix async provider callbacks by removing async and wrapping returns in Promise.resolve"""

import re


def fix_provider_callbacks(filepath):
    """Fix provider callback functions in a file"""
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    original = content

    # Pattern 1: async (params) => { ... return expr; }  ->  (params) => { ... return Promise.resolve(expr); }
    # This handles multi-line callbacks with explicit return

    # First, find all provider callback functions
    # They look like: key: async (params) => { ... return ... }

    # Let's use a more careful approach - parse the file
    lines = content.split("\n")
    result = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # Check if this line starts a provider callback
        match = re.match(
            r"^(\s+)(createProvider|listModels|listVoices|isAvailableBy|validateProviderConfig|loadModel):\s*async\s*\(([^)]*)\)\s*=>\s*\{",
            line,
        )
        if match:
            indent = match.group(1)
            key = match.group(2)
            params = match.group(3)

            # This is the start of an async provider callback
            # Collect the function body until matching }
            func_lines = [line]
            brace_count = line.count("{") - line.count("}")
            i += 1

            while i < len(lines) and brace_count > 0:
                func_lines.append(lines[i])
                brace_count += lines[i].count("{") - lines[i].count("}")
                i += 1

            # Now we have the full function. Fix it.
            func_body = "\n".join(func_lines)

            # Replace async with non-async
            new_func = func_body.replace("async ", "", 1)

            # Now find return statements and wrap in Promise.resolve
            # But only for the direct returns (not nested functions)
            # This is complex - let's just wrap the whole return expr

            # Pattern: return expr;  ->  return Promise.resolve(expr);
            # But be careful with multi-line returns
            new_func = re.sub(
                r"^\s*return\s+(.+?);",
                r"return Promise.resolve(\1);",
                new_func,
                flags=re.MULTILINE,
            )

            result.append(new_func)
        else:
            result.append(line)
            i += 1

    content = "\n".join(result)

    if content != original:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Fixed: {filepath}")
    else:
        print(f"No changes: {filepath}")


# Fix providers.ts
fix_provider_callbacks("/home/vi/animaios/packages/stage-ui/src/stores/providers.ts")
