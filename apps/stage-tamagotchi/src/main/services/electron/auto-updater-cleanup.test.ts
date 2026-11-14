import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { cleanupRedundantPendingInstallers } from './auto-updater'

describe('cleanupRedundantPendingInstallers (Issue #3469)', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'airi-updater-cleanup-test-'))
  })

  afterEach(async () => {
    await rm(tempDir, { force: true, recursive: true })
  })

  // https://github.com/moeru-ai/airi/issues/3469
  // ROOT CAUSE:
  //
  // On Windows, NSIS copies the installer to installer.exe in the root updater cache directory.
  // The downloaded installer and update-info.json stay in the pending directory after the update.
  //
  // Before this fix, the pending directory retained redundant multi-gigabyte installer files across updates.
  //
  // We fixed this by deleting matching pending installers and obsolete update-info.json on bundle health report.
  it('deletes duplicate pending installer and obsolete update-info.json when it matches root installer.exe (Issue #3469)', async () => {
    const installerContent = 'NSIS_INSTALLER_PAYLOAD_VERSION_0_15_2_MOCK'
    const rootInstallerPath = join(tempDir, 'installer.exe')
    const pendingDir = join(tempDir, 'pending')
    const pendingInstallerPath = join(pendingDir, 'airi-0.15.2-setup.exe')
    const updateInfoPath = join(pendingDir, 'update-info.json')

    await mkdir(pendingDir, { recursive: true })
    await writeFile(rootInstallerPath, installerContent)
    await writeFile(pendingInstallerPath, installerContent)
    await writeFile(updateInfoPath, JSON.stringify({ fileName: 'airi-0.15.2-setup.exe' }))

    const result = await cleanupRedundantPendingInstallers({ cacheDir: tempDir })

    expect(result.cleaned).toContain('airi-0.15.2-setup.exe')
    expect(result.cleaned).toContain('update-info.json')

    // Root installer.exe must be preserved for differential updates
    const rootStat = await stat(rootInstallerPath).catch(() => undefined)
    expect(rootStat).toBeDefined()
    expect(rootStat?.isFile()).toBe(true)

    // Pending installer and metadata must be removed
    const pendingStat = await stat(pendingInstallerPath).catch(() => undefined)
    expect(pendingStat).toBeUndefined()

    const updateInfoStat = await stat(updateInfoPath).catch(() => undefined)
    expect(updateInfoStat).toBeUndefined()
  })

  it('preserves a newer pending update that does not match root installer.exe (Issue #3469)', async () => {
    const rootContent = 'NSIS_INSTALLER_PAYLOAD_0_15_2'
    const newerPendingContent = 'NSIS_INSTALLER_PAYLOAD_0_15_3_NEWER'
    const rootInstallerPath = join(tempDir, 'installer.exe')
    const pendingDir = join(tempDir, 'pending')
    const pendingInstallerPath = join(pendingDir, 'airi-0.15.3-setup.exe')
    const updateInfoPath = join(pendingDir, 'update-info.json')

    await mkdir(pendingDir, { recursive: true })
    await writeFile(rootInstallerPath, rootContent)
    await writeFile(pendingInstallerPath, newerPendingContent)
    await writeFile(updateInfoPath, JSON.stringify({ fileName: 'airi-0.15.3-setup.exe' }))

    const result = await cleanupRedundantPendingInstallers({ cacheDir: tempDir })

    expect(result.cleaned).toEqual([])

    // Both root and newer pending installer must remain intact
    const rootStat = await stat(rootInstallerPath).catch(() => undefined)
    expect(rootStat).toBeDefined()

    const pendingStat = await stat(pendingInstallerPath).catch(() => undefined)
    expect(pendingStat).toBeDefined()

    const updateInfoStat = await stat(updateInfoPath).catch(() => undefined)
    expect(updateInfoStat).toBeDefined()
  })

  it('preserves update-info.json if it refers to a newer uninstalled pending installer (Issue #3469)', async () => {
    const rootContent = 'NSIS_INSTALLER_PAYLOAD_0_15_2'
    const staleMatchingContent = rootContent
    const newerPendingContent = 'NSIS_INSTALLER_PAYLOAD_0_15_3_NEWER'
    const rootInstallerPath = join(tempDir, 'installer.exe')
    const pendingDir = join(tempDir, 'pending')
    const staleInstallerPath = join(pendingDir, 'airi-0.15.2-setup.exe')
    const newerInstallerPath = join(pendingDir, 'airi-0.15.3-setup.exe')
    const updateInfoPath = join(pendingDir, 'update-info.json')

    await mkdir(pendingDir, { recursive: true })
    await writeFile(rootInstallerPath, rootContent)
    await writeFile(staleInstallerPath, staleMatchingContent)
    await writeFile(newerInstallerPath, newerPendingContent)
    await writeFile(updateInfoPath, JSON.stringify({ fileName: 'airi-0.15.3-setup.exe' }))

    const result = await cleanupRedundantPendingInstallers({ cacheDir: tempDir })

    // Stale matching installer is cleaned up
    expect(result.cleaned).toContain('airi-0.15.2-setup.exe')
    // update-info.json is preserved because it refers to newer airi-0.15.3-setup.exe
    expect(result.cleaned).not.toContain('update-info.json')

    const updateInfoStat = await stat(updateInfoPath).catch(() => undefined)
    expect(updateInfoStat).toBeDefined()
  })

  it('preserves pending installer if installation was canceled or root installer.exe does not exist (Issue #3469)', async () => {
    const pendingDir = join(tempDir, 'pending')
    const pendingInstallerPath = join(pendingDir, 'airi-0.15.2-setup.exe')

    await mkdir(pendingDir, { recursive: true })
    await writeFile(pendingInstallerPath, 'DOWNLOADED_INSTALLER_NOT_YET_APPLIED')

    const result = await cleanupRedundantPendingInstallers({ cacheDir: tempDir })

    expect(result.cleaned).toEqual([])

    const pendingStat = await stat(pendingInstallerPath).catch(() => undefined)
    expect(pendingStat).toBeDefined()
  })

  it('handles empty or missing pending directory without error (Issue #3469)', async () => {
    const rootInstallerPath = join(tempDir, 'installer.exe')
    await writeFile(rootInstallerPath, 'ROOT_INSTALLER')

    const result = await cleanupRedundantPendingInstallers({ cacheDir: tempDir })
    expect(result.cleaned).toEqual([])
  })
})
