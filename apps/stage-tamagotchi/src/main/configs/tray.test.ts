import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTrayConfig } from './tray'

const paths = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({ app: { getPath: () => paths.userData } }))

describe('tray preferences', () => {
  beforeEach(async () => {
    paths.userData = await mkdtemp(join(tmpdir(), 'airi-tray-config-'))
  })

  afterEach(async () => {
    await rm(paths.userData, { recursive: true, force: true })
  })

  it('defaults to visible icons and reloads the saved opt-in preference', async () => {
    const config = createTrayConfig()
    expect(config.get()).toEqual({ hideAppIcon: false })

    config.update({ hideAppIcon: true })
    await vi.waitFor(async () => {
      expect(JSON.parse(await readFile(join(paths.userData, 'tray-options.json'), 'utf8'))).toEqual({ hideAppIcon: true })
    })
    expect(createTrayConfig().get()).toEqual({ hideAppIcon: true })

    config.update({ hideAppIcon: false })
    await vi.waitFor(async () => {
      expect(JSON.parse(await readFile(join(paths.userData, 'tray-options.json'), 'utf8'))).toEqual({ hideAppIcon: false })
    })
    expect(createTrayConfig().get()).toEqual({ hideAppIcon: false })
  })
})
