import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { execPath } from 'node:process'
import { fileURLToPath } from 'node:url'

import { expect, it } from 'vitest'

it('bundles source-only routine contracts into the Electron main process', () => {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const result = spawnSync(execPath, ['--input-type=module', '--eval', `
    import { resolveConfig } from 'electron-vite';
    import { build } from 'vite';
    const resolved = await resolveConfig({ root: process.cwd() }, 'build', 'production');
    const main = resolved.config.main;
    // The ergosphere-it main plugin drops the lib entry for in-memory builds, so name the main entry here.
    const built = await build({ ...main, build: { ...main.build, write: false, rolldownOptions: { ...main.build?.rolldownOptions, input: { index: 'src/main/index.ts' } } } });
    const outputs = (Array.isArray(built) ? built : [built]).flatMap(result => result.output);
    const imports = outputs.filter(output => output.type === 'chunk').flatMap(output => [...output.imports, ...output.dynamicImports]);
    console.log('ROUTINE_EXTERNALS=' + JSON.stringify(imports.filter(name => name.startsWith('@proj-airi/stage-ui/'))));
  `], { cwd: packageRoot, encoding: 'utf8', timeout: 45000, maxBuffer: 1024 * 1024 })
  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
  const match = /ROUTINE_EXTERNALS=(\[[^\n]*\])/.exec(result.stdout)
  expect(match, result.stdout).not.toBeNull()
  expect(JSON.parse(match![1])).toEqual([])
}, 60000)
