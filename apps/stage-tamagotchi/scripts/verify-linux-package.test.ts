import process from 'node:process'

import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { isWindows } from 'std-env'
import { describe, expect, it } from 'vitest'

import { runTimedProcess, stopProcessGroup } from './process-group'
import {
  assertDebPackageContract,
  assertDesktopEntryContract,
  assertExecutableArchitecture,
  assertFlatpakDesktopEntryContract,
  assertFlatpakPackageContract,
  assertRpmPackageContract,
  isSuccessfulLaunchSmoke,
} from './verify-linux-package'

const validPackage = {
  packageName: 'ai.moeru.airi',
  architecture: 'arm64',
  entries: [
    { path: './opt/AIRI/airi', mode: '-rwxr-xr-x' },
    { path: './usr/share/applications/airi.desktop', mode: '-rw-r--r--' },
    { path: './usr/share/icons/hicolor/512x512/apps/airi.png', mode: '-rw-r--r--' },
  ],
}

const validRpmPackage = {
  packageName: 'ai.moeru.airi',
  architecture: 'aarch64',
  scripts: [
    'if [ ! -e \'/opt/AIRI/airi\' ]; then',
    'update-alternatives --remove \'airi\' \'/opt/AIRI/airi\' || true',
    'find \'/opt/AIRI\' -depth -type d -empty -delete 2>/dev/null || true',
  ].join('\n'),
  entries: [
    { path: '/opt/AIRI/airi', mode: '-rwxr-xr-x' },
    { path: '/usr/share/applications/airi.desktop', mode: '-rw-r--r--' },
    { path: '/usr/share/icons/hicolor/512x512/apps/airi.png', mode: '-rw-r--r--' },
  ],
}

const validFlatpakPackage = {
  appId: 'ai.moeru.airi',
  architecture: 'aarch64',
  runtime: 'org.freedesktop.Platform/aarch64/24.08',
  command: 'airi.sh',
  entries: [
    { path: './files/lib/airi/airi', mode: '-rwxr-xr-x' },
    { path: './files/bin/airi.sh', mode: '-rwxr-xr-x' },
    { path: './export/share/applications/ai.moeru.airi.desktop', mode: '-rw-r--r--' },
    { path: './export/share/icons/hicolor/512x512/apps/ai.moeru.airi.png', mode: '-rw-r--r--' },
  ],
}

function packageWithNativeEntries(architecture: string, paths: string[]) {
  return {
    ...validPackage,
    architecture,
    entries: [
      ...validPackage.entries,
      ...paths.map(path => ({ path, mode: '-rwxr-xr-x' })),
    ],
  }
}

describe('linux DEB package verification', () => {
  it('accepts the expected ARM64 package contract', () => {
    expect(() => assertDebPackageContract(validPackage, 'arm64')).not.toThrow()
  })

  it('accepts the expected x64 Debian architecture', () => {
    expect(() => assertDebPackageContract({ ...validPackage, architecture: 'amd64' }, 'x64')).not.toThrow()
  })

  // ROOT CAUSE:
  //
  // A successful electron-builder process does not prove that the package matches the runner architecture.
  // A mislabeled package can reach a release and fail only after a user installs it.
  //
  // Before this check, the release workflow uploaded the package without reading its Debian metadata.
  //
  // We fixed this by comparing the package architecture with the release-matrix architecture.
  it('rejects a package for the wrong architecture', () => {
    expect(() => assertDebPackageContract(validPackage, 'x64')).toThrow('Expected Debian architecture amd64, received arm64')
  })

  it('rejects a package without the desktop executable', () => {
    expect(() => assertDebPackageContract({
      ...validPackage,
      entries: validPackage.entries.filter(entry => entry.path !== './opt/AIRI/airi'),
    }, 'arm64')).toThrow('Missing executable: ./opt/AIRI/airi')
  })

  it('rejects a desktop executable without execute permission', () => {
    expect(() => assertDebPackageContract({
      ...validPackage,
      entries: validPackage.entries.map(entry => entry.path === './opt/AIRI/airi' ? { ...entry, mode: '-rw-r--r--' } : entry),
    }, 'arm64')).toThrow('Desktop executable is not executable: ./opt/AIRI/airi')
  })

  it('rejects a package without a desktop entry', () => {
    expect(() => assertDebPackageContract({
      ...validPackage,
      entries: validPackage.entries.filter(entry => entry.path !== './usr/share/applications/airi.desktop'),
    }, 'arm64')).toThrow('Missing desktop entry')
  })

  it('rejects a package without an application icon', () => {
    expect(() => assertDebPackageContract({
      ...validPackage,
      entries: validPackage.entries.filter(entry => !entry.path.includes('/icons/')),
    }, 'arm64')).toThrow('Missing application icon')
  })
})

describe('linux RPM package verification', () => {
  it('accepts the expected ARM64 RPM contract', () => {
    expect(() => assertRpmPackageContract(validRpmPackage, 'arm64')).not.toThrow()
  })

  it('accepts the expected x64 RPM architecture', () => {
    expect(() => assertRpmPackageContract({ ...validRpmPackage, architecture: 'x86_64' }, 'x64')).not.toThrow()
  })

  it('rejects an RPM for the wrong architecture', () => {
    expect(() => assertRpmPackageContract(validRpmPackage, 'x64')).toThrow('Expected RPM architecture x86_64, received aarch64')
  })

  it('rejects an RPM without desktop integration', () => {
    expect(() => assertRpmPackageContract({
      ...validRpmPackage,
      entries: validRpmPackage.entries.filter(entry => !entry.path.endsWith('.desktop')),
    }, 'arm64')).toThrow('Missing desktop entry')
  })

  // ROOT CAUSE:
  //
  // Electron Builder 26.8.1 passes /usr/bin/airi to update-alternatives --remove.
  // Fedora registers /opt/AIRI/airi as the alternatives target instead.
  //
  // Before the fix, DNF removal succeeded but left two broken launcher links.
  //
  // We fixed this by inspecting the final RPM scriptlet and requiring the registered target.
  it('rejects the Electron Builder removal script that leaves broken alternatives links', () => {
    expect(() => assertRpmPackageContract({
      ...validRpmPackage,
      scripts: 'update-alternatives --remove \'airi\' \'/usr/bin/airi\'',
    }, 'arm64')).toThrow('RPM removal script must preserve upgrades and remove /opt/AIRI/airi')
  })

  it('rejects foreign native payloads in an RPM', () => {
    const foreignPath = '/opt/AIRI/resources/app.asar.unpacked/node_modules/uiohook-napi/prebuilds/linux-x64/uiohook-napi.node'

    expect(() => assertRpmPackageContract({
      ...validRpmPackage,
      entries: [...validRpmPackage.entries, { path: foreignPath, mode: '-rwxr-xr-x' }],
    }, 'arm64')).toThrow(`Foreign native payload for arm64: ${foreignPath}`)
  })
})

describe('linux Flatpak package verification', () => {
  it('accepts the expected ARM64 Flatpak contract', () => {
    expect(() => assertFlatpakPackageContract(validFlatpakPackage, 'arm64')).not.toThrow()
  })

  it('accepts the expected x64 Flatpak architecture', () => {
    expect(() => assertFlatpakPackageContract({
      ...validFlatpakPackage,
      architecture: 'x86_64',
      runtime: 'org.freedesktop.Platform/x86_64/24.08',
    }, 'x64')).not.toThrow()
  })

  it('rejects a Flatpak for the wrong architecture', () => {
    expect(() => assertFlatpakPackageContract(validFlatpakPackage, 'x64')).toThrow('Expected Flatpak architecture x86_64, received aarch64')
  })

  it('rejects a Flatpak with the wrong runtime', () => {
    expect(() => assertFlatpakPackageContract({
      ...validFlatpakPackage,
      runtime: 'org.freedesktop.Platform/aarch64/23.08',
    }, 'arm64')).toThrow('Expected Flatpak runtime org.freedesktop.Platform/aarch64/24.08')
  })

  it('rejects a Flatpak without an exported icon', () => {
    expect(() => assertFlatpakPackageContract({
      ...validFlatpakPackage,
      entries: validFlatpakPackage.entries.filter(entry => !entry.path.includes('/icons/')),
    }, 'arm64')).toThrow('Missing application icon')
  })

  it('rejects foreign native payloads in a Flatpak', () => {
    const foreignPath = './files/lib/airi/resources/app.asar.unpacked/node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64.node'

    expect(() => assertFlatpakPackageContract({
      ...validFlatpakPackage,
      entries: [...validFlatpakPackage.entries, { path: foreignPath, mode: '-rwxr-xr-x' }],
    }, 'arm64')).toThrow(`Foreign native payload for arm64: ${foreignPath}`)
  })
})

describe('linux launch smoke result', () => {
  it('accepts an app that stays active for the smoke-test window', () => {
    expect(isSuccessfulLaunchSmoke({ exitCode: null, signal: 'SIGTERM', timedOut: true })).toBe(true)
  })

  it('rejects an app that exits before the smoke-test window ends', () => {
    expect(isSuccessfulLaunchSmoke({ exitCode: 0, signal: null, timedOut: false })).toBe(false)
  })

  // ROOT CAUSE:
  //
  // Electron can ignore SIGTERM after Xvfb closes and keep its child processes active.
  // The verifier sent one signal and returned before the process group stopped.
  //
  // Before the fix, a package check left AIRI active on the Fedora runner.
  //
  // We fixed this by waiting after SIGTERM and then sending SIGKILL to the same process group.
  it.skipIf(isWindows)('stops a process group when its parent and child ignore SIGTERM', async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'airi-process-group-'))
    const processFile = join(runtimeRoot, 'processes.json')
    const childSource = 'process.on(\'SIGTERM\', () => {}); setInterval(() => {}, 1000)'
    const parentSource = [
      'const { spawn } = require(\'node:child_process\')',
      'const { writeFileSync } = require(\'node:fs\')',
      `const child = spawn(process.execPath, ['-e', ${JSON.stringify(childSource)}], { stdio: 'ignore' })`,
      `writeFileSync(${JSON.stringify(processFile)}, JSON.stringify({ parent: process.pid, child: child.pid }))`,
      'process.on(\'SIGTERM\', () => {})',
      'setInterval(() => {}, 1000)',
    ].join(';')
    const parent = spawn(process.execPath, ['-e', parentSource], {
      detached: true,
      stdio: 'ignore',
    })

    let processIds: { child: number, parent: number } | undefined
    try {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        try {
          processIds = JSON.parse(await readFile(processFile, 'utf8'))
          break
        }
        catch {
          await new Promise(resolveDelay => setTimeout(resolveDelay, 20))
        }
      }
      expect(processIds).toBeDefined()

      await stopProcessGroup(parent.pid!, 'SIGTERM')

      expect(isProcessActive(processIds!.parent)).toBe(false)
      expect(isProcessActive(processIds!.child)).toBe(false)
    }
    finally {
      if (parent.pid !== undefined) {
        try {
          process.kill(-parent.pid, 'SIGKILL')
        }
        catch {
          // The fixed implementation already stopped the process group.
        }
      }
      await rm(runtimeRoot, { recursive: true, force: true })
    }
  })

  it.skipIf(isWindows)('waits for process-group cleanup after the wrapper exits', async () => {
    const runtimeRoot = await mkdtemp(join(tmpdir(), 'airi-timed-process-'))
    const processFile = join(runtimeRoot, 'processes.json')
    const childSource = 'process.on(\'SIGTERM\', () => {}); setInterval(() => {}, 1000)'
    const wrapperSource = [
      'const { spawn } = require(\'node:child_process\')',
      'const { writeFileSync } = require(\'node:fs\')',
      `const child = spawn(process.execPath, ['-e', ${JSON.stringify(childSource)}], { stdio: 'ignore' })`,
      `writeFileSync(${JSON.stringify(processFile)}, JSON.stringify({ wrapper: process.pid, child: child.pid }))`,
      'process.on(\'SIGTERM\', () => process.exit(0))',
      'setInterval(() => {}, 1000)',
    ].join(';')

    let processIds: { child: number, wrapper: number } | undefined
    try {
      const resultPromise = runTimedProcess(process.execPath, ['-e', wrapperSource], process.env, async () => {
        // Keep the process group alive until its child PID is observable. A fixed startup delay
        // races with a loaded CI runner and can signal the wrapper before it creates the fixture.
        for (let attempt = 0; attempt < 250; attempt += 1) {
          try {
            processIds = JSON.parse(await readFile(processFile, 'utf8'))
            return
          }
          catch {
            await new Promise(resolveDelay => setTimeout(resolveDelay, 20))
          }
        }
        throw new Error('Timed process did not publish its process IDs')
      }, 100)

      const result = await resultPromise

      expect(processIds).toBeDefined()
      expect(result.timedOut).toBe(true)
      expect(isProcessActive(processIds!.wrapper)).toBe(false)
      expect(isProcessActive(processIds!.child)).toBe(false)
    }
    finally {
      if (processIds !== undefined) {
        try {
          process.kill(-processIds.wrapper, 'SIGKILL')
        }
        catch {
          // The fixed implementation already stopped the process group.
        }
      }
      await rm(runtimeRoot, { recursive: true, force: true })
    }
  })
})

function isProcessActive(processId: number): boolean {
  try {
    process.kill(processId, 0)
    return true
  }
  catch {
    return false
  }
}

describe('linux executable verification', () => {
  it('accepts an ARM64 ELF executable for an ARM64 package', () => {
    expect(() => assertExecutableArchitecture('Machine:                           AArch64', 'arm64')).not.toThrow()
  })

  it('accepts an x64 ELF executable for an x64 package', () => {
    expect(() => assertExecutableArchitecture('Machine:                           Advanced Micro Devices X86-64', 'x64')).not.toThrow()
  })

  it('rejects an ELF executable for the wrong architecture', () => {
    expect(() => assertExecutableArchitecture('Machine:                           Advanced Micro Devices X86-64', 'arm64')).toThrow('Expected an AArch64 executable')
  })
})

describe('linux desktop entry verification', () => {
  it('accepts the AIRI executable and icon names', () => {
    expect(() => assertDesktopEntryContract('[Desktop Entry]\nExec=/opt/AIRI/airi %U\nIcon=airi\n')).not.toThrow()
  })

  it('rejects an entry that cannot start AIRI', () => {
    expect(() => assertDesktopEntryContract('[Desktop Entry]\nExec=missing\nIcon=airi\n')).toThrow('Desktop entry must use Exec=/opt/AIRI/airi')
  })

  it('rejects an entry without the AIRI icon', () => {
    expect(() => assertDesktopEntryContract('[Desktop Entry]\nExec=/opt/AIRI/airi\nIcon=missing\n')).toThrow('Desktop entry must use Icon=airi')
  })

  it('accepts the Flatpak launcher and application icon', () => {
    expect(() => assertFlatpakDesktopEntryContract('[Desktop Entry]\nExec=airi.sh %U\nIcon=ai.moeru.airi\n')).not.toThrow()
  })

  it('rejects a Flatpak entry with the direct Electron command', () => {
    expect(() => assertFlatpakDesktopEntryContract('[Desktop Entry]\nExec=airi %U\nIcon=ai.moeru.airi\n')).toThrow('Flatpak desktop entry must use Exec=airi.sh')
  })
})

describe('linux native payload verification', () => {
  it('accepts ARM64 Linux native binaries in an ARM64 package', () => {
    expect(() => assertDebPackageContract(packageWithNativeEntries('arm64', [
      './opt/AIRI/resources/app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v3/linux/arm64/onnxruntime_binding.node',
      './opt/AIRI/resources/app.asar.unpacked/node_modules/uiohook-napi/prebuilds/linux-arm64/uiohook-napi.node',
      './opt/AIRI/resources/app.asar.unpacked/node_modules/electron-click-drag-plugin/build/Release/linux-arm64/drag.node',
      './opt/AIRI/resources/app.asar.unpacked/node_modules/@img/sharp-linux-arm64/lib/sharp-linux-arm64.node',
    ]), 'arm64')).not.toThrow()
  })

  it('accepts neutral parent directories for native payloads', () => {
    expect(() => assertDebPackageContract({
      ...validPackage,
      entries: [
        ...validPackage.entries,
        { path: './opt/AIRI/resources/app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v3/', mode: 'drwxr-xr-x' },
        { path: './opt/AIRI/resources/app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v3/linux/', mode: 'drwxr-xr-x' },
      ],
    }, 'arm64')).not.toThrow()
  })

  it('accepts x64 Linux native binaries in an x64 package', () => {
    expect(() => assertDebPackageContract(packageWithNativeEntries('amd64', [
      './opt/AIRI/resources/app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v3/linux/x64/onnxruntime_binding.node',
      './opt/AIRI/resources/app.asar.unpacked/node_modules/uiohook-napi/prebuilds/linux-x64/uiohook-napi.node',
      './opt/AIRI/resources/app.asar.unpacked/node_modules/electron-click-drag-plugin/build/Release/linux-x64/drag.node',
      './opt/AIRI/resources/app.asar.unpacked/node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64.node',
    ]), 'x64')).not.toThrow()
  })

  // ROOT CAUSE:
  //
  // The ARM64 Debian package contains native modules for macOS, Windows, and other Linux architectures.
  // Electron Builder includes all unpacked native-module variants because the file rules do not filter their target directories.
  // The generated ARM64 package is 568 MB and needs more than 1.7 GB when extracted.
  //
  // Before the fix, the package contract accepts every foreign native payload.
  //
  // The fix must keep only Linux native binaries that match the package architecture.
  it('rejects macOS native binaries in a Linux package', () => {
    const foreignPath = './opt/AIRI/resources/app.asar.unpacked/node_modules/onnxruntime-node/bin/napi-v3/darwin/arm64/libonnxruntime.dylib'

    expect(() => assertDebPackageContract(packageWithNativeEntries('arm64', [foreignPath]), 'arm64'))
      .toThrow(`Foreign native payload for arm64: ${foreignPath}`)
  })

  it('rejects Windows native binaries in a Linux package', () => {
    const foreignPath = './opt/AIRI/resources/app.asar.unpacked/node_modules/electron-click-drag-plugin/build/Release/win32-arm64/drag.node'

    expect(() => assertDebPackageContract(packageWithNativeEntries('arm64', [foreignPath]), 'arm64'))
      .toThrow(`Foreign native payload for arm64: ${foreignPath}`)
  })

  it('rejects Linux x64 native binaries in an ARM64 package', () => {
    const foreignPath = './opt/AIRI/resources/app.asar.unpacked/node_modules/uiohook-napi/prebuilds/linux-x64/uiohook-napi.node'

    expect(() => assertDebPackageContract(packageWithNativeEntries('arm64', [foreignPath]), 'arm64'))
      .toThrow(`Foreign native payload for arm64: ${foreignPath}`)
  })

  it('rejects Linux ARM64 native binaries in an x64 package', () => {
    const foreignPath = './opt/AIRI/resources/app.asar.unpacked/node_modules/@img/sharp-linux-arm64/lib/sharp-linux-arm64.node'

    expect(() => assertDebPackageContract(packageWithNativeEntries('amd64', [foreignPath]), 'x64'))
      .toThrow(`Foreign native payload for x64: ${foreignPath}`)
  })

  it('rejects unsupported Linux architectures', () => {
    const foreignPath = './opt/AIRI/resources/app.asar.unpacked/node_modules/uiohook-napi/prebuilds/linux-loong64/uiohook-napi.node'

    expect(() => assertDebPackageContract(packageWithNativeEntries('arm64', [foreignPath]), 'arm64'))
      .toThrow(`Foreign native payload for arm64: ${foreignPath}`)
  })
})
