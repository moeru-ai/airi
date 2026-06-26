#!/usr/bin/env python3
import os
import re
from collections import defaultdict

ROOT = "/home/vi/animaios"
EXTS = {".ts", ".tsx", ".vue"}
SKIP = {
    "node_modules",
    ".git",
    "dist",
    ".nuxt",
    ".output",
    "coverage",
    "__snapshots__",
    ".cache",
    ".vite",
    ".turbo",
    ".vscode",
    "vendor",
}
results = defaultdict(list)
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in SKIP]
    for fn in filenames:
        fp = os.path.join(dirpath, fn)
        if not any(fp.endswith(e) for e in EXTS):
            continue
        rel = os.path.relpath(fp, ROOT)
        if any(p in rel for p in [".cache/", "/dist/", "node_modules/"]):
            continue
        try:
            lines = open(fp, "r", encoding="utf-8", errors="replace").readlines()
        except:
            continue
        in_async = False
        depth = 0
        has_await = False
        sl = 0
        header = ""
        for i, line in enumerate(lines):
            stripped = line.strip()
            if not in_async:
                if re.search(r"\basync\b", stripped) and "{" in stripped:
                    in_async = True
                    sl = i
                    header = stripped[:100]
                    has_await = "await" in stripped
                    depth = stripped.count("{") - stripped.count("}")
                    continue
            else:
                depth += stripped.count("{") - stripped.count("}")
                if "await" in stripped:
                    has_await = True
                if depth <= 0:
                    if not has_await:
                        results[rel].append((sl + 1, i + 1, header))
                    in_async = False
                    depth = 0
for rel in sorted(results, key=lambda r: -len(results[r]))[:10]:
    print(f"\n=== {rel} ({len(results[rel])} issues) ===")
    for sl, el, hdr in results[rel]:
        print(f"  L{sl}-{el}: {hdr}")
