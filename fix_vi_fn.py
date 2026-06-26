#!/usr/bin/env python3
"""Fix async vi.fn patterns in test files"""

import re


def fix_vi_fn_async(filepath):
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    original = content

    # Pattern: vi.fn(async (params) => { ... })
    # Replace with: vi.fn((params) => { ... })
    # This is safe because these mocks don't use await

    # Handle vi.fn(async (params) => { ... })
    content = re.sub(
        r"vi\.fn\(async\s*\(([^)]*)\)\s*=>\s*\{", r"vi.fn((\1) => {", content
    )

    # Handle vi.fn(async () => { ... })
    content = re.sub(r"vi\.fn\(async\s*\(\)\s*=>\s*\{", r"vi.fn(() => {", content)

    # Handle vi.fn(async (params) => expr) - single expression
    content = re.sub(
        r"vi\.fn\(async\s*\(([^)]*)\)\s*=>\s*([^,\{]+?)\)",
        r"vi.fn((\1) => \2)",
        content,
    )

    # Handle vi.fn(async () => expr)
    content = re.sub(
        r"vi\.fn\(async\s*\(\)\s*=>\s*([^,\{]+?)\)", r"vi.fn(() => \1)", content
    )

    # Handle vi.fn(async () => { return expr })
    content = re.sub(
        r"vi\.fn\(async\s*\(\)\s*=>\s*\{\s*return\s+([^;]+?);\s*\}",
        r"vi.fn(() => Promise.resolve(\1))",
        content,
    )

    if content != original:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Fixed: {filepath}")
        return True
    return False


# Process all test files with vi.fn(async
import os
import subprocess

result = subprocess.run(
    ["grep", "-rl", "vi.fn(async", ".", "--include=*.test.ts"],
    capture_output=True,
    text=True,
    cwd="/home/vi/animaios",
)
files = result.stdout.strip().split("\n")
for f in files:
    if f and not "node_modules" in f:
        fix_vi_fn_async(os.path.join("/home/vi/animaios", f))

print("Done fixing vi.fn(async patterns")
