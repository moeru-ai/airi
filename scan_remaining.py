#!/usr/bin/env python3
import os, re, json
from collections import defaultdict
ROOT = '/home/vi/animaios'
EXTS = {'.ts', '.tsx', '.vue'}
SKIP = {'node_modules', '.git', 'dist', '.nuxt', '.output', 'coverage', '__snapshots__', '.cache', '.vite', '.turbo', '.vscode', 'vendor'}
issues = defaultdict(lambda: defaultdict(list))
any_re = re.compile(r':\s*any[\s,;\[\)\]|&<>&)]|<any>|\bas\s+any\b')
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in SKIP]
    for fn in filenames:
        fp = os.path.join(dirpath, fn)
        if not any(fp.endswith(e) for e in EXTS): continue
        rel = os.path.relpath(fp, ROOT)
        if any(p in rel for p in ['.cache/', '/dist/', 'node_modules/']): continue
        try: src = open(fp, 'r', encoding='utf-8', errors='replace').read()
        except: continue
        lines = src.split('\n')
        in_async = False; depth = 0; has_await = False; start_line = 0
        for i, line in enumerate(lines):
            stripped = line.strip()
            if not in_async:
                if re.search(r'\basync\b', stripped) and '{' in stripped:
                    in_async = True; start_line = i+1; has_await = 'await' in stripped
                    depth = stripped.count('{') - stripped.count('}'); continue
            else:
                depth += stripped.count('{') - stripped.count('}')
                if 'await' in stripped: has_await = True
                if depth <= 0:
                    if not has_await: issues['JS-0116'][rel].append(start_line)
                    in_async = False; depth = 0
        for i, raw in enumerate(lines):
            s = raw.strip()
            if any_re.search(s) and not s.startswith('//') and not s.startswith('*'):
                issues['JS-0323'][rel].append(i+1)
            if re.search(r'return\s+.*[&|]{2}.*[&|]{2}', s):
                issues['JS-W1041'][rel].append(i+1)

g1 = {f:lines for f,lines in issues['JS-0116'].items() if f.startswith('packages/stage-ui')}
g2 = {f:lines for f,lines in issues['JS-0116'].items() if f.startswith('apps/')}
g3 = {f:lines for f,lines in issues['JS-0116'].items() if f not in list(g1.keys()) + list(g2.keys())}
for name, data in [('g1_stage_ui_js0116', g1), ('g2_apps_js0116', g2), ('g3_remaining_js0116', g3)]:
    with open(f'/tmp/{name}.json', 'w') as f:
        json.dump(data, f, indent=2)
    print(f'{name}: {sum(len(v) for v in data.values())} issues in {len(data)} files')
with open('/tmp/g4_js0323.json', 'w') as f:
    json.dump(dict(issues['JS-0323']), f, indent=2)
with open('/tmp/g5_jsw1041.json', 'w') as f:
    json.dump(dict(issues['JS-W1041']), f, indent=2)
print(f'JS-0323: {sum(len(v) for v in issues["JS-0323"].values())} issues in {len(issues["JS-0323"])} files')
print(f'JS-W1041: {sum(len(v) for v in issues["JS-W1041"].values())} issues in {len(issues["JS-W1041"])} files')
for code in ['JS-0116','JS-0323','JS-W1041']:
    if code not in issues: continue
    print(f'\n=== {code} ===')
    sorted_files = sorted(issues[code].items(), key=lambda x: -len(x[1]))
    for fp, lines in sorted_files:
        print(f'  {fp} ({len(lines)})')
