import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

const { x } = vi.hoisted(() => ({
  x: vi.fn(),
}))

vi.mock('tinyexec', () => ({
  x,
}))

describe('prepareCapViteLaunch', () => {
  it('captures the user config while forwarding the remaining vite args', async () => {
    const { prepareCapViteLaunch } = await import('./index')

    expect(prepareCapViteLaunch(['--host', '0.0.0.0', '--config', 'vite.mobile.ts', '--configLoader', 'runner'])).toEqual({
      baseConfigFile: resolve(process.cwd(), 'vite.mobile.ts'),
      configLoader: 'runner',
      projectRoot: process.cwd(),
      viteArgs: ['--host', '0.0.0.0', '--configLoader', 'runner'],
      wrapperConfigFile: expect.stringMatching(/packages\/cap-vite\/(src|dist)\/vite-wrapper-config\.(ts|mjs)$/),
    })
  })

  it('uses the leading positional vite root as the wrapper root', async () => {
    const { prepareCapViteLaunch } = await import('./index')

    expect(prepareCapViteLaunch(['apps/stage-pocket', '--host', '0.0.0.0'])).toEqual({
      baseConfigFile: undefined,
      configLoader: undefined,
      projectRoot: resolve(process.cwd(), 'apps/stage-pocket'),
      viteArgs: ['apps/stage-pocket', '--host', '0.0.0.0'],
      wrapperConfigFile: expect.stringMatching(/packages\/cap-vite\/(src|dist)\/vite-wrapper-config\.(ts|mjs)$/),
    })
  })

  it('throws when --config is missing its value', async () => {
    const { prepareCapViteLaunch } = await import('./index')

    expect(() => prepareCapViteLaunch(['--config'])).toThrow('Missing value for `--config`.')
  })
})

describe('runCapVite', () => {
  it('launches vite with the wrapper config and cap-vite env vars', async () => {
    const { runCapVite } = await import('./index')
    x.mockResolvedValue({
      exitCode: 0,
      stderr: '',
      stdout: '',
    })

    await runCapVite(
      ['--host', '0.0.0.0', '--config', 'vite.mobile.ts', '--configLoader=runner'],
      ['ios', '--target', 'iPhone 16 Pro', '--scheme', 'AIRI'],
    )

    expect(x).toHaveBeenCalledWith('vite', [
      '--config',
      expect.stringMatching(/packages\/cap-vite\/(src|dist)\/vite-wrapper-config\.(ts|mjs)$/),
      '--host',
      '0.0.0.0',
      '--configLoader=runner',
    ], {
      nodeOptions: {
        cwd: process.cwd(),
        env: {
          CAP_VITE_BASE_CONFIG: resolve(process.cwd(), 'vite.mobile.ts'),
          CAP_VITE_CAP_ARGS_JSON: JSON.stringify(['ios', '--target', 'iPhone 16 Pro', '--scheme', 'AIRI']),
          CAP_VITE_CONFIG_LOADER: 'runner',
          CAP_VITE_ROOT: process.cwd(),
        },
        stdio: 'inherit',
      },
      throwOnError: false,
    })
  })
})
