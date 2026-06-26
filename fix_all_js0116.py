#!/usr/bin/env python3
"""Comprehensive fix for JS-0116: Remove async from functions without await,
wrapping returns in Promise.resolve where the return type is expected to be Promise."""

import re


def fix_vi_fn_async(content):
    """Fix vi.fn(async ...) patterns in test files"""

    # Pattern 1: vi.fn(async () => expr) or vi.fn(async (params) => expr)
    # Replace with vi.fn(() => Promise.resolve(expr))
    def replace_vi_fn_simple(match):
        full = match.group(0)
        params = match.group(1)
        body = match.group(2)
        return f"vi.fn({params} => Promise.resolve({body}))"

    # Match: vi.fn(async (params) => expr)
    content = re.sub(
        r"vi\.fn\(\s*async\s*\(([^)]*)\)\s*=>\s*([^,{}\n]+)\)",
        replace_vi_fn_simple,
        content,
    )

    # Pattern 2: vi.fn(async () => { ... return expr; })
    # Replace with vi.fn(() => { ... return Promise.resolve(expr); })
    def replace_vi_fn_block(match):
        full = match.group(0)
        params = match.group(1)
        body = match.group(2)
        # Wrap return statements in Promise.resolve
        body = re.sub(r"\breturn\s+(.+?);", r"return Promise.resolve(\1);", body)
        return f"vi.fn({params} => {{{body}}})"

    # Match: vi.fn(async (params) => { ... })
    content = re.sub(
        r"vi\.fn\(\s*async\s*\(([^)]*)\)\s*=>\s*\{([^}]*)\}\)",
        replace_vi_fn_block,
        content,
    )

    return content


def fix_provider_callbacks(content):
    """Fix provider callback functions (createProvider, listModels, etc.)"""
    # These are in object literals: key: async (params) => { ... }
    # Need to remove async and wrap returns in Promise.resolve

    lines = content.split("\n")
    result = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # Check for provider callback patterns
        match = re.match(
            r"^(\s+)(createProvider|listModels|listVoices|isAvailableBy|validateProviderConfig|loadModel|fetch):\s*async\s*\(([^)]*)\)\s*=>\s*\{",
            line,
        )
        if match:
            indent = match.group(1)
            key = match.group(2)
            params = match.group(3)

            # Collect full function
            func_lines = [line]
            brace_count = line.count("{") - line.count("}")
            i += 1
            while i < len(lines) and brace_count > 0:
                func_lines.append(lines[i])
                brace_count += lines[i].count("{") - lines[i].count("}")
                i += 1

            # Fix the function
            func_body = "\n".join(func_lines)
            # Remove async
            func_body = func_body.replace("async ", "", 1)
            # Wrap return statements
            func_body = re.sub(
                r"^(\s*)return\s+(.+?);",
                r"\1return Promise.resolve(\2);",
                func_body,
                flags=re.MULTILINE,
            )
            result.append(func_body)
        else:
            # Check for single-line: key: async (params) => expr,
            match2 = re.match(
                r"^(\s+)(createProvider|listModels|listVoices|isAvailableBy|validateProviderConfig|loadModel|fetch):\s*async\s*\(([^)]*)\)\s*=>\s*([^,{}]+)(?=,|\})",
                line,
            )
            if match2:
                indent = match2.group(1)
                key = match2.group(2)
                params = match2.group(3)
                expr = match2.group(4).strip()
                new_line = f"{indent}{key}: {params} => Promise.resolve({expr})"
                result.append(new_line)
                i += 1
            else:
                # Check for single-line with [ or { directly
                match3 = re.match(
                    r"^(\s+)(listModels|listVoices|createProvider):\s*async\s*\(([^)]*)\)\s*=>\s*(\[|\{)",
                    line,
                )
                if match3:
                    indent = match3.group(1)
                    key = match3.group(2)
                    params = match3.group(3)
                    bracket = match3.group(4)
                    new_line = f"{indent}{key}: {params} => Promise.resolve({bracket}"
                    result.append(new_line)
                    i += 1
                    # We need to also find the closing and adjust, but this is complex
                    # For now just handle the opening
                else:
                    result.append(line)
                    i += 1
    return "\n".join(result)


def fix_file(filepath):
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    original = content

    # First fix vi.fn(async) patterns
    content = fix_vi_fn_async(content)

    # Then fix provider callbacks
    content = fix_provider_callbacks(content)

    if content != original:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        return True
    return False


# Test on one file first
test_file = (
    "/home/vi/animaios/packages/core-agent/src/agents/spark-notify/handler.test.ts"
)
print(f"Fixing {test_file}...")
fix_file(test_file)
