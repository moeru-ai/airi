import { join } from 'node:path'
import { platform } from 'node:process'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { runNativeEntrypointProbe } from '../../../testdata/run-native-entrypoint-probe'

describe('filesystem entrypoints through native Node ESM', () => {
  // https://github.com/moeru-ai/airi/issues/3359
  // ROOT CAUSE:
  //
  // Raw paths treat Windows drive letters as schemes and filename characters as URL syntax.
  // We fixed this by converting filesystem paths with pathToFileURL before native import().
  it('imports absolute and relative filesystem paths without URL interpretation (Issue #3359)', async () => {
    const { root, result } = await runNativeEntrypointProbe('paths')
    expect(result).toEqual(['entry.mjs', 'space 中文 # % %23.mjs'].flatMap(name => [
      { revision: name, url: pathToFileURL(join(root, name)).href },
      { revision: name, url: pathToFileURL(join(root, name)).href },
    ]))
  })

  it.skipIf(platform === 'win32')('preserves POSIX question marks in filenames', async () => {
    const { root, result } = await runNativeEntrypointProbe('literal-question-mark')
    expect(result).toEqual({
      revision: 'question',
      url: `${pathToFileURL(join(root, 'literal?query # %23.mjs')).href}?${new URLSearchParams({ cacheBust: '? & # % 中文' })}`,
    })
  })

  it('separates entry-module cache identity from the unchanged manifest', async () => {
    const { root, result } = await runNativeEntrypointProbe('cache')
    expect(result).toEqual({
      first: { revision: 'A', url: `${pathToFileURL(join(root, 'cache.mjs')).href}?${new URLSearchParams({ cacheBust: 'A ? & # % + 中文' })}` },
      same: { revision: 'A', url: `${pathToFileURL(join(root, 'cache.mjs')).href}?${new URLSearchParams({ cacheBust: 'A ? & # % + 中文' })}` },
      fresh: { revision: 'B', url: `${pathToFileURL(join(root, 'cache.mjs')).href}?cacheBust=B` },
      empty: { revision: 'B', url: `${pathToFileURL(join(root, 'cache.mjs')).href}?cacheBust=` },
      omitted: { revision: 'B', url: pathToFileURL(join(root, 'cache.mjs')).href },
      unchanged: true,
    })
  })

  it('passes start and reload options without retaining cache keys in sessions', async () => {
    const { result } = await runNativeEntrypointProbe('host-reload')
    expect(result).toEqual({
      results: [['A'], ['A'], ['B'], ['B'], ['C']],
      sessionManifestUnchanged: true,
      manifestUnchanged: true,
      sessions: [],
    })
  })
})
