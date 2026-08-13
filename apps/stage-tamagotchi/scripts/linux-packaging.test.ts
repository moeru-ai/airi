/* eslint-disable no-template-curly-in-string */

import type { Configuration } from 'electron-builder'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { minimatch } from 'minimatch'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import electronBuilderConfig from '../electron-builder.config'

import { getFilenames } from './utils'

const packageConfig: Configuration = electronBuilderConfig

const releaseOptions = {
  release: true,
  autoTag: false,
  tag: ['0.11.3'],
}

function isIncludedByLinuxFilePatterns(path: string, architecture: 'arm64' | 'x64'): boolean {
  const exclusions = electronBuilderConfig.linux.files
    .filter((pattern): pattern is string => typeof pattern === 'string' && pattern.startsWith('!'))
    .map(pattern => pattern.slice(1).replaceAll('${arch}', architecture))

  return exclusions.every(pattern => !minimatch(path, pattern, { dot: true }))
}

describe('linux package configuration', () => {
  it('builds Debian and RPM packages on each Linux architecture', () => {
    expect(electronBuilderConfig.linux.target).toEqual([
      'deb',
      'rpm',
    ])
  })

  it('keeps only native dependencies for the Linux target architecture', () => {
    expect(electronBuilderConfig.linux.files).toEqual([
      '!**/onnxruntime-node/bin/napi-v3/!(linux){,/**/*}',
      '!**/onnxruntime-node/bin/napi-v3/linux/!(${arch}){,/**/*}',
      '!**/uiohook-napi/prebuilds/!(linux-${arch}){,/**/*}',
      '!**/electron-click-drag-plugin/build/Release/!(linux-${arch}){,/**/*}',
      '!**/node_modules/@img/sharp-!(linux-${arch}|libvips-*){,/**/*}',
      '!**/node_modules/@img/sharp-libvips-!(linux-${arch}){,/**/*}',
    ])
  })

  it('keeps the target Sharp and libvips packages while excluding foreign packages', () => {
    // ROOT CAUSE:
    //
    // The combined Sharp brace pattern lets the `sharp-` branch consume the `libvips-` prefix.
    // Its negative extglob then excludes the target libvips package with every foreign package.
    // The fix must use non-overlapping exclusions for the two native package families.
    expect(isIncludedByLinuxFilePatterns(
      'node_modules/@img/sharp-linux-arm64/lib/sharp-linux-arm64.node',
      'arm64',
    )).toBe(true)
    expect(isIncludedByLinuxFilePatterns(
      'node_modules/@img/sharp-libvips-linux-arm64/lib/libvips-cpp.so',
      'arm64',
    )).toBe(true)
    expect(isIncludedByLinuxFilePatterns(
      'node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64.node',
      'arm64',
    )).toBe(false)
    expect(isIncludedByLinuxFilePatterns(
      'node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so',
      'arm64',
    )).toBe(false)
    expect(isIncludedByLinuxFilePatterns(
      'node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64.node',
      'x64',
    )).toBe(true)
    expect(isIncludedByLinuxFilePatterns(
      'node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so',
      'x64',
    )).toBe(true)
  })

  // ROOT CAUSE:
  //
  // Electron Builder 26.8.1 removes /usr/bin/airi from the alternatives group.
  // The registered target is /opt/AIRI/airi, so RPM removal leaves two broken links.
  // An old package also runs its removal hook after a new package is installed.
  //
  // Before the fix, reinstall printed "has not been configured as an alternative".
  // Final removal left /usr/bin/airi and /etc/alternatives/airi on Fedora.
  //
  // We fixed this with one package hook that keeps links during an upgrade.
  // The hook removes the registered target only after the AIRI executable is absent.
  it('removes the alternatives target only after the final package removal', () => {
    const afterRemove = 'build/after-remove-linux.tpl'

    expect(packageConfig.deb?.afterRemove).toBe(afterRemove)
    expect(packageConfig.rpm?.afterRemove).toBe(afterRemove)

    const source = readFileSync(join(import.meta.dirname, '..', afterRemove), 'utf8')
    expect(source).toContain('if [ ! -e \'/opt/${sanitizedProductName}/${executable}\' ]; then')
    expect(source).toContain('update-alternatives --remove \'${executable}\' \'/opt/${sanitizedProductName}/${executable}\'')
    expect(source).not.toContain('update-alternatives --remove \'${executable}\' \'/usr/bin/${executable}\'')
    expect(source).toContain('apparmor_parser --remove "$APPARMOR_PROFILE_DEST" || true')
    expect(source).toContain('find \'/opt/${sanitizedProductName}\' -depth -type d -empty -delete')
  })

  it('generates architecture-aware artifact names for Linux ARM64', async () => {
    const artifacts = await getFilenames('aarch64-unknown-linux-gnu', releaseOptions)

    expect(artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        extension: 'deb',
        outputFilename: 'AIRI-0.11.3-linux-arm64.deb',
      }),
      expect.objectContaining({
        extension: 'rpm',
        outputFilename: 'AIRI-0.11.3-linux-aarch64.rpm',
      }),
      expect.objectContaining({
        extension: 'flatpak',
        outputFilename: 'AIRI-0.11.3-linux-arm64.flatpak',
      }),
    ]))
  })

  it('generates architecture-aware artifact names for Linux x64', async () => {
    const artifacts = await getFilenames('x86_64-unknown-linux-gnu', releaseOptions)

    expect(artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        extension: 'deb',
        outputFilename: 'AIRI-0.11.3-linux-amd64.deb',
      }),
      expect.objectContaining({
        extension: 'rpm',
        outputFilename: 'AIRI-0.11.3-linux-x86_64.rpm',
      }),
      expect.objectContaining({
        extension: 'flatpak',
        outputFilename: 'AIRI-0.11.3-linux-x64.flatpak',
      }),
    ]))
  })
})

describe('linux release workflow', () => {
  const workflowPath = join(import.meta.dirname, '..', '..', '..', '.github', 'workflows', 'release-tamagotchi.yml')
  const workflowSource = readFileSync(workflowPath, 'utf8')
  const workflow = parse(workflowSource)
  const linuxBuildStep = workflow.jobs.build.steps.find((step: { name?: string }) => step.name === 'Build (Linux Only)')
  const linuxSetupStep = workflow.jobs.build.steps.find((step: { name?: string }) => step.name === 'Setup Flatpak (Linux Only)')
  const linuxVerificationStep = workflow.jobs.build.steps.find((step: { name?: string }) => step.name === 'Verify Linux Packages')
  const fedoraLifecycleStep = workflow.jobs.build.steps.find((step: { name?: string }) => step.name === 'Verify RPM Lifecycle on Fedora')

  // ROOT CAUSE:
  //
  // A 4 GB ARM64 host exhausted Node's default heap during the renderer build.
  // Electron Builder then exhausted the tmpfs quota while FPM created the Debian package.
  //
  // Before the fix, the Linux step used the default Node heap and the system temporary directory.
  //
  // We fixed this by giving Node a bounded 3 GB heap and using the runner's disk-backed temporary directory.
  it('provides enough heap and disk-backed temporary space for Linux packages', () => {
    expect(linuxBuildStep.env.NODE_OPTIONS).toBe('--max-old-space-size=3072')
    expect(linuxBuildStep.env.TMPDIR).toBe('${{ runner.temp }}/electron-builder')
    expect(linuxBuildStep.run).toContain('mkdir -p "$TMPDIR"')
  })

  it('installs the RPM and Flatpak inspection tools', () => {
    expect(linuxSetupStep.run).toContain('rpm')
    expect(linuxSetupStep.run).toContain('libarchive-tools')
    expect(linuxSetupStep.run).toContain('ostree')
  })

  it('verifies every Linux package before upload', () => {
    expect(linuxVerificationStep.run).toContain('--deb "dist/${DEB_OUTPUT_NAME}"')
    expect(linuxVerificationStep.run).toContain('--rpm "dist/${RPM_OUTPUT_NAME}"')
    expect(linuxVerificationStep.run).toContain('--flatpak "dist/${FLATPAK_OUTPUT_NAME}"')
    expect(linuxVerificationStep.run).toContain('--arch ${{ matrix.arch }}')
  })

  // ROOT CAUSE:
  //
  // Electron Builder uploaded Linux artifacts while it built them.
  // The package verification steps ran later and could not prevent a broken artifact from publishing.
  //
  // Before the fix, the Linux build selected onTagOrDraft for release runs.
  //
  // We fixed this by keeping Linux artifacts local. Existing post-verification upload steps publish them.
  it('does not publish Linux packages before verification succeeds', () => {
    expect(linuxBuildStep.run).toContain('--publish=never')
    expect(linuxBuildStep.run).not.toContain('onTagOrDraft')
  })

  // ROOT CAUSE:
  //
  // Package inspection did not run RPM transaction scripts on a Fedora system.
  // DNF reinstall and removal therefore left broken alternatives links without failing CI.
  //
  // Before the fix, the workflow extracted and started the RPM only on Ubuntu.
  //
  // We fixed this with a native Fedora container that runs the complete RPM lifecycle.
  it('runs the RPM install lifecycle on native Fedora userspace', () => {
    expect(fedoraLifecycleStep.if).toBe('${{ matrix.os == \'ubuntu-latest\' || matrix.os == \'ubuntu-24.04-arm\' }}')
    expect(fedoraLifecycleStep.run).toContain('fedora:44')
    expect(fedoraLifecycleStep.run).toContain('--privileged')
    expect(fedoraLifecycleStep.run).toContain('verify-fedora-rpm-lifecycle.sh')

    const lifecycleSource = readFileSync(join(import.meta.dirname, '..', '..', '..', '.github', 'scripts', 'verify-fedora-rpm-lifecycle.sh'), 'utf8')
    expect(lifecycleSource).toContain('dnf install -y "$rpm_path"')
    expect(lifecycleSource).toContain('dnf reinstall -y "$rpm_path"')
    expect(lifecycleSource).toContain('LAUNCH_STAYED_ACTIVE')
    expect(lifecycleSource).toContain('dnf remove -y ai.moeru.airi')
    expect(lifecycleSource).toContain('assert_path_absent /usr/bin/airi')
    expect(lifecycleSource).toContain('assert_path_absent /etc/alternatives/airi')
    expect(lifecycleSource).toContain('assert_path_absent /opt/AIRI')
  })
})

describe('flatpak package configuration', () => {
  const manifestPath = join(import.meta.dirname, '..', 'ai.moeru.airi.flatpak.yml')
  const manifestSource = readFileSync(manifestPath, 'utf8')
  const manifest = parse(manifestSource)
  const appModule = manifest.modules[0]

  it('selects the unpacked Electron app for the host architecture', () => {
    const sources = appModule.sources

    expect(sources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        'only-arches': ['x86_64'],
        'path': 'dist/linux-unpacked',
      }),
      expect.objectContaining({
        'only-arches': ['aarch64'],
        'path': 'dist/linux-arm64-unpacked',
      }),
    ]))
  })

  it('launches Electron through the Flatpak sandbox wrapper', () => {
    const launcher = appModule.sources.find((source: { type: string }) => source.type === 'script')

    expect(manifest.command).toBe('airi.sh')
    expect(launcher['dest-filename']).toBe('airi.sh')
    expect(launcher.commands).toContain('exec zypak-wrapper /app/lib/airi/airi "$@"')
    expect(appModule['build-commands']).toContain('install airi.sh /app/bin/airi.sh')
    expect(appModule['build-commands']).toContain('ln -s /app/bin/airi.sh /app/bin/airi')
  })

  // ROOT CAUSE:
  //
  // The Flatpak copies the Electron application into /app/lib, but it does not
  // install desktop metadata. Flatpak can export only a command-line symlink.
  // The installed AIRI application is therefore absent from desktop menus.
  //
  // Before the fix, /app/share contains no AIRI desktop entry or application icon.
  //
  // We fixed this by installing app-ID-named desktop metadata and its icon.
  it('exports the desktop entry and application icon', () => {
    expect(appModule.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'ai.moeru.airi.desktop',
        type: 'file',
      }),
      expect.objectContaining({
        dest: 'build',
        path: 'build/icon-512.png',
        type: 'file',
      }),
      expect.objectContaining({
        path: 'ai.moeru.airi.metainfo.xml',
        type: 'file',
      }),
    ]))
    expect(appModule['build-commands']).toContain('install -Dm644 ai.moeru.airi.desktop /app/share/applications/ai.moeru.airi.desktop')
    expect(appModule['build-commands']).toContain('install -Dm644 ai.moeru.airi.metainfo.xml /app/share/metainfo/ai.moeru.airi.metainfo.xml')
    expect(appModule['build-commands']).toContain('install -Dm644 build/icon-512.png /app/share/icons/hicolor/512x512/apps/ai.moeru.airi.png')
  })

  it('uses the Flatpak command and application ID in the desktop entry', () => {
    const desktopEntry = readFileSync(join(import.meta.dirname, '..', 'ai.moeru.airi.desktop'), 'utf8')

    expect(desktopEntry).toContain('\nExec=airi %U\n')
    expect(desktopEntry).toContain('\nIcon=ai.moeru.airi\n')
  })
})
