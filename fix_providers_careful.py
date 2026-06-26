#!/usr/bin/env python3
"""Carefully fix async provider callbacks in providers.ts"""

import re


def fix_providers_careful():
    filepath = "/home/vi/animaios/packages/stage-ui/src/stores/providers.ts"
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    # Strategy: Find each async function without await, and fix it.
    # We'll process line by line, tracking async function boundaries.

    lines = content.split("\n")
    result = []
    i = 0
    while i < len(lines):
        line = lines[i]

        # Check if this line starts an async function that's a provider callback
        # Pattern: key: async (params) => {
        match = re.match(
            r"^(\s+)(createProvider|listModels|listVoices|isAvailableBy|validateProviderConfig|loadModel):\s*async\s*\(([^)]*)\)\s*=>\s*\{(.*)$",
            line,
        )
        if not match:
            # Also check for: key: async (params) => expr,  (single-line)
            match2 = re.match(
                r"^(\s+)(createProvider|listModels|listVoices|isAvailableBy|validateProviderConfig|loadModel):\s*async\s*\(([^)]*)\)\s*=>\s*(.+?)(\s*)$",
                line,
            )
            if match2 and not line.rstrip().endswith("{"):
                # Single-line: key: async (params) => expr
                indent = match2.group(1)
                key = match2.group(2)
                params = match2.group(3)
                expr = match2.group(4).strip()
                # Remove trailing comma if present
                trailing = ""
                if expr.endswith(","):
                    expr = expr[:-1]
                    trailing = ","
                result.append(
                    f"{indent}{key}: ({params}) => Promise.resolve({expr}){trailing}"
                )
                i += 1
                continue
            result.append(line)
            i += 1
            continue

        indent = match.group(1)
        key = match.group(2)
        params = match.group(3)
        rest = match.group(4)

        # Collect the function body until matching }
        func_start = i
        func_lines = [line]
        brace_count = line.count("{") - line.count("}")
        i += 1
        while i < len(lines) and brace_count > 0:
            func_lines.append(lines[i])
            brace_count += lines[i].count("{") - lines[i].count("}")
            i += 1

        # Check if this function has await
        full_func = "\n".join(func_lines)
        has_await = "await" in full_func or "await" in rest

        if has_await:
            # This is a legitimate async function, leave it alone
            result.extend(func_lines)
            continue

        # Fix the function: remove async and wrap returns in Promise.resolve
        # Replace the first 'async ' in the function signature
        fixed_lines = []
        first_line_fixed = False
        for fl in func_lines:
            if not first_line_fixed:
                fl = fl.replace("async ", "", 1)
                first_line_fixed = True
            # Wrap return statements in Promise.resolve
            # Match: return <expr>;
            fl = re.sub(r"\breturn\s+(.+);", r"return Promise.resolve(\1);", fl)
            fixed_lines.append(fl)

        result.extend(fixed_lines)

    content = "\n".join(result)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

    print("Fixed providers.ts (careful)")


fix_providers_careful()
