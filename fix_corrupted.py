#!/usr/bin/env python3
"""Fix corrupted vi.fn patterns caused by sed replacement of 'vi.fn(async () =>'"""

import os
import re
import subprocess


def fix_corrupted_vi_fn(filepath):
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    original = content

    # The corruption pattern: {vi.fn(() =>param: Type) => expr)
    # Original was: vi.fn(async (param: Type) => expr)
    # The sed turned 'vi.fn(async () =>' into 'vi.fn(() =>' but with params it became
    # 'vi.fn(() =>param: Type) => expr)' which is wrong.
    #
    # The actual sed did: s/vi\.fn(async () =>/vi.fn(() =>/g
    # But the pattern in the file was: vi.fn(async (param: Type) =>
    # So it became: vi.fn((param: Type) =>  (the async was correctly removed from this pattern)
    # However some had: vi.fn(async (param: Type, ...) =>
    #
    # Let me check what actually became {vi.fn pattern

    # Pattern: {vi.fn(() =>param: Type) => expr)
    # This happens when the original was something like:
    # obj: vi.fn(async (param: Type) => expr)
    # And sed replaced 'vi.fn(async () =>' with 'vi.fn(() =>' but for multi-param functions
    # it didn't match, so the '{' from the object literal was consumed differently.

    # Actually, looking at the output more carefully, the pattern is:
    # {vi.fn(() =>param: Type) => {   or   {vi.fn(() =>_param: Type) => expr)
    #
    # This means the sed replaced a line like:
    #   key: vi.fn(async (param: Type) => {
    # to:
    #   key: {vi.fn(() =>param: Type) => {
    #
    # The '{' before 'vi.fn' is wrong - it should be just 'vi.fn'
    # And the '() =>' before params is wrong - it should be '(param: Type) =>'

    # Fix pattern: {vi.fn(() =>_params) =>   →   vi.fn((_params) =>
    # Fix pattern: {vi.fn(() =>_params: Type) =>   →   vi.fn((_params: Type) =>
    content = re.sub(
        r"\{vi\.fn\(\(\)\s*=>\s*(\w+(?::\s*[^,)]+(?:,\s*\w+(?::\s*[^,)]+)*)*)\)\s*=>",
        lambda m: f"vi.fn(({m.group(1)}) =>",
        content,
    )

    # Fix pattern: vi.fn(() =>param: Type) => expr)
    # (without the leading {)
    content = re.sub(
        r"vi\.fn\(\(\)\s*=>\s*(\w+(?::\s*[^,)]+(?:,\s*\w+(?::\s*[^,)]+)*)*)\)\s*=>",
        lambda m: f"vi.fn(({m.group(1)}) =>",
        content,
    )

    # Fix pattern: vi.fn(() => {... with trailing problems
    # Actually let me just look for all broken patterns

    # More general: {vi.fn(() =>  →  vi.fn((
    content = content.replace("{vi.fn(() =>", "vi.fn((")

    # And then fix: vi.fn(()(params) =>  →  vi.fn((params) =>
    # Not really... let me think again

    if content != original:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"Fixed: {filepath}")
        return True
    return False


# Find all corrupted files
result = subprocess.run(
    ["grep", "-rl", "{vi.fn", ".", "--include=*.ts", "--include=*.tsx"],
    capture_output=True,
    text=True,
    cwd="/home/vi/animaios",
)
files = result.stdout.strip().split("\n")
for f in files:
    if f and "node_modules" not in f:
        fix_corrupted_vi_fn(os.path.join("/home/vi/animaios", f))

print("Done fixing corrupted vi.fn patterns")
