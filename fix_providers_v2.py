#!/usr/bin/env python3
"""Fix async provider callbacks in providers.ts by removing async and wrapping returns in Promise.resolve"""
import re

def fix_providers_ts():
    filepath = '/home/vi/animaios/packages/stage-ui/src/stores/providers.ts'
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    # Pattern: key: async (params) => { ... return expr; }
    # Replace with: key: (params) => { ... return Promise.resolve(expr); }
    # This is complex because we need to find the matching braces

    lines = content.split('\n')
    result = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # Match provider callback start
        match = re.match(r'^(\s+)(createProvider|listModels|listVoices|isAvailableBy|validateProviderConfig|loadModel):\s*async\s*\(([^)]*)\)\s*=>\s*\{', line)
        if match:
            indent = match.group(1)
            key = match.group(2)
            params = match.group(3)

            # Collect the full function body
            func_lines = [line]
            brace_count = line.count('{') - line.count('}')
            i += 1
            while i < len(lines) and brace_count > 0:
                func_lines.append(lines[i])
                brace_count += lines[i].count('{') - lines[i].count('}')
                i += 1

            # Now fix the function
            func_body = '\n'.join(func_lines)
            # Remove 'async ' from the first line
            func_body = func_body.replace('async ', '', 1)
            # Wrap return statements in Promise.resolve
            func_body = re.sub(
                r'^(\s*)return\s+(.+?);',
                r'\1return Promise.resolve(\2);',
                func_body,
                flags=re.MULTILINE
            )
            result.append(func_body)
        else:
            result.append(line)
            i += 1

    content = '\n'.join(result)

    # Also handle single-line returns: key: async () => expr,
    content = re.sub(
        r'^(\s+)(createProvider|listModels|listVoices|isAvailableBy|validateProviderConfig|loadModel):\s*async\s*\(([^)]*)\)\s*=>\s*([^,{}]+)(?=,|\})',
        lambda m: f'{m.group(1)}{m.group(2)}: {m.group(3)} => Promise.resolve({m.group(4).strip()})',
        content,
        flags=re.MULTILINE
    )

    # Also handle arrow functions with block but implicit return (no return keyword)
    # Pattern: key: async () => { expr }
    content = re.sub(
        r'^(\s+)(createProvider|listModels|listVoices|isAvailableBy|validateProviderConfig|loadModel):\s*async\s*\(([^)]*)\)\s*=>\s*\{([^}]+)\}',
        lambda m: f'{m.group(1)}{m.group(2)}: {m.group(3)} => Promise.resolve({m.group(4).strip()})',
        content,
        flags=re.MULTILINE
    )

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print("Fixed providers.ts")

fix_providers_ts()
