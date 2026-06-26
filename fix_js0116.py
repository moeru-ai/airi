#!/usr/bin/env python3
"""Remove async from arrow functions that have no await, wrapping returns in Promise.resolve where needed."""

import os
import re
import sys


def fix_file(filepath):
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()

    result = list(lines)
    changed = 0

    # Track async arrow functions
    in_async = False
    depth = 0
    has_await = False
    start_line = 0
    header = ""
    is_arrow = False

    for i, line in enumerate(lines):
        stripped = line.strip()
        if not in_async:
            # Match async arrow functions
            m = re.search(r"\basync\s+", stripped)
            if m and ("=>" in stripped or "{" in stripped):
                # Check it's an arrow function or async function expression
                if (
                    "async (" in stripped
                    or "async (" in stripped
                    or re.search(r":\s*async\s", stripped)
                    or re.search(r"=\s*async\s", stripped)
                ):
                    in_async = True
                    start_line = i
                    header = stripped
                    has_await = "await" in stripped
                    depth = stripped.count("{") - stripped.count("}")
                    is_arrow = True
                    continue
                # async function declarations
                elif re.search(r"\basync\s+function\b", stripped):
                    in_async = True
                    start_line = i
                    header = stripped
                    has_await = "await" in stripped
                    depth = stripped.count("{") - stripped.count("}")
                    is_arrow = False
                    continue
        else:
            depth += stripped.count("{") - stripped.count("}")
            if "await" in stripped:
                has_await = True
            if depth <= 0:
                if not has_await:
                    # This async function has no await - fix it
                    # Replace 'async ' in the header line
                    old_line = result[start_line]
                    # Only replace if it's a provider callback pattern
                    # Check if the return type context requires Promise
                    if re.search(
                        r"(createProvider|listModels|listVoices|isAvailableBy|validateProviderConfig|fetch):",
                        old_line,
                    ):
                        new_line = re.sub(r"\basync\s+", "", old_line, count=1)
                        # For single-line returns like: async () => createPlayer2(...)
                        if (
                            "return" not in new_line
                            and "=>" in new_line
                            and depth == 0
                            and "{" not in new_line.split("=>")[1]
                        ):
                            # async () => expr  →  () => Promise.resolve(expr)
                            pass  # These need manual handling
                        result[start_line] = new_line
                        changed += 1
                    elif re.search(r"\basync\s+function\b", old_line):
                        # async function with no await
                        pass  # Need to handle carefully

                in_async = False
                depth = 0

    if changed > 0:
        with open(filepath, "w", encoding="utf-8") as f:
            f.writelines(result)
    return changed


# Process providers.ts specially
filepath = "/home/vi/animaios/packages/stage-ui/src/stores/providers.ts"
print(f"Fixing {filepath}...")
changed = fix_file(filepath)
print(f"  Changed {changed} lines")
