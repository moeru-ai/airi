#!/usr/bin/env bash
set -euo pipefail
if [ -f node_modules/kirie/package.json ]; then
  node -p "require('./node_modules/kirie/package.json').version"
else
  node -p "const p=require('./package.json'); const v=p.devDependencies?.kirie||p.dependencies?.kirie; if(!v) throw new Error('kirie version missing'); String(v).replace(/^[^0-9]*/, '')"
fi
