import type { Configuration } from 'electron-builder'

import process from 'node:process'

import { x } from 'tinyexec'

import packageJSON from '../package.json' with { type: 'json' }

export async function getVersion(options: { release: boolean, autoTag: boolean, tag: string[] }) {
  if (!options.release || !options.tag) {
    // Otherwise, fetch from the latest git ref
    const res = await x('git', ['log', '-1', '--pretty=format:"%H"'])

    const date = new Date().toISOString().split('T')[0].replace(/-/g, '')

    return `nightly-${date}-${String(res.stdout.replace(/"/g, '')).trim().substring(0, 7)}`
  }

  // If --release is specified, use the version from package.json
  let version = packageJSON.version

  // If --tag is specified, use the provided tag
  if (options.tag[0] !== 'true') {
    version = String(options.tag[0]).replace(/^v/, '').trim()
  }
  // Otherwise, even for --tag option (true / enabled), ignore the input
  else {
    version = ''
  }

  if (version) {
    return version
  }

  // If no version is provided and --auto-tag is not specified, throw an error
  if (!options.autoTag) {
    throw new Error('Tag cannot be empty when --release is specified')
  }

  // Now, only auto-tag & release && non-specific tag is the only possibility,
  // fetch the latest git ref
  try {
    const res = await x('git', ['describe', '--tags', '--abbrev=0'])

    return String(res.stdout).replace(/^v/, '').trim()
  }
  catch {
    // If no tags exist, fall back to package.json version
    console.warn('No git tags found, falling back to package.json version')
    return packageJSON.version
  }
}

export async function getElectronBuilderConfig(): Promise<Configuration> {
  const config = await import ('../electron-builder.config')
  return config.default
}

export function applyTemplateOfArtifactName(
  template: string,
  productName: string,
  version: string,
  arch: string,
  ext: string,
): string {
  return template
    // eslint-disable-next-line no-template-curly-in-string
    .replace('${productName}', productName)
    // eslint-disable-next-line no-template-curly-in-string
    .replace('${version}', version)
    // eslint-disable-next-line no-template-curly-in-string
    .replace('${arch}', arch)
    // eslint-disable-next-line no-template-curly-in-string
    .replace('${ext}', ext)
}

interface FilenameOutputEntry {
  target: string
  extension: string
  outputFilename: string
  releaseArtifactFilename: string
  productName: string
  version: string
  optional?: boolean
}

/**
 * Returns the architecture name that electron-builder writes into the artifact name of `ext`.
 *
 * The names differ by package format. See `getArtifactArchName` in `builder-util/out/arch.js`.
 */
export function mapArchFor(
  target: string,
  ext: string,
): string {
  switch (true) {
    case target === 'aarch64-unknown-linux-gnu':
      if (ext === 'rpm' || ext === 'pacman') {
        return 'aarch64'
      }

      return 'arm64'
    case target === 'x86_64-unknown-linux-gnu':
      if (ext === 'rpm' || ext === 'AppImage') {
        return 'x86_64'
      }
      if (ext === 'deb') {
        return 'amd64'
      }

      return 'x64'
    case target === 'aarch64-apple-darwin':
      return 'arm64'
    case target === 'x86_64-apple-darwin':
      return 'x64'
    case target === 'x86_64-pc-windows-msvc':
      return 'x64'
    default:
      return 'x64'
  }
}

function getLatestUpdateFilename(target: string): string | null {
  switch (target) {
    case 'x86_64-pc-windows-msvc':
      return `latest-${mapArchFor(target, 'yml')}.yml`
    case 'x86_64-unknown-linux-gnu':
      return `latest-${mapArchFor(target, 'yml')}-linux.yml`
    case 'aarch64-unknown-linux-gnu':
      return `latest-${mapArchFor(target, 'yml')}-linux-${mapArchFor(target, 'yml')}.yml`
    case 'aarch64-apple-darwin':
    case 'x86_64-apple-darwin':
      return `latest-${mapArchFor(target, 'yml')}-mac.yml`
    default:
      return null
  }
}

function getMacZipFilename(productName: string, version: string, target: string): string {
  const arch = mapArchFor(target, 'zip')
  const archPrefix = arch === 'x64' ? '' : `${arch}-`
  return `${productName}-${version}-${archPrefix}mac.zip`
}

/** The Linux package formats that electron-builder builds, in the order of `linux.target`. */
const LINUX_ELECTRON_BUILDER_EXTENSIONS = ['deb', 'rpm', 'pacman', 'AppImage']

function getLinuxFilenames(
  target: string,
  electronBuilder: Configuration,
  productName: string,
  beforeVersion: string,
  version: string,
): FilenameOutputEntry[] {
  const linux = electronBuilder.linux
  const artifacts: FilenameOutputEntry[] = []
  if (linux?.artifactName) {
    const targets = [linux.target ?? []].flat().map(entry => typeof entry === 'string' ? entry : entry.target)
    // Flatpak is built outside electron-builder, but it follows the Linux name template.
    const extensions = [...LINUX_ELECTRON_BUILDER_EXTENSIONS.filter(extension => targets.includes(extension)), 'flatpak']

    for (const extension of extensions) {
      artifacts.push({
        target,
        extension,
        outputFilename: applyTemplateOfArtifactName(linux.artifactName, productName, beforeVersion, mapArchFor(target, extension), extension),
        releaseArtifactFilename: applyTemplateOfArtifactName(linux.artifactName, productName, version, mapArchFor(target, extension), extension),
        productName,
        version,
      })
    }
  }

  const latestUpdateFilename = getLatestUpdateFilename(target)
  if (latestUpdateFilename) {
    artifacts.push({
      target,
      extension: latestUpdateFilename,
      outputFilename: latestUpdateFilename,
      releaseArtifactFilename: latestUpdateFilename,
      productName,
      version,
      optional: true,
    })
  }

  return artifacts
}

export async function getFilenames(target: string, options: { release: boolean, autoTag: boolean, tag: string[] }): Promise<FilenameOutputEntry[]> {
  const electronBuilder = await getElectronBuilderConfig()
  const version = await getVersion(options)

  if (!target) {
    throw new Error('<Target> is required')
  }

  // electron-builder names the files with the version of the build, see `extraMetadata` of electron-builder.config.ts.
  const beforeVersion = process.env.ERGOSPHERE_IT_VERSION || packageJSON.version
  const productName = electronBuilder.productName!

  switch (target) {
    case 'x86_64-pc-windows-msvc':

      return [
        {
          target: 'x86_64-pc-windows-msvc',
          extension: 'exe',
          outputFilename: applyTemplateOfArtifactName(
            electronBuilder.nsis!.artifactName!,
            productName,
            beforeVersion,
            mapArchFor(target, 'exe'),
            'exe',
          ),
          releaseArtifactFilename: applyTemplateOfArtifactName(
            electronBuilder.nsis!.artifactName!,
            productName,
            version,
            mapArchFor(target, 'exe'),
            'exe',
          ),
          productName,
          version,
        },
        {
          target: 'x86_64-pc-windows-msvc',
          extension: getLatestUpdateFilename(target)!,
          outputFilename: getLatestUpdateFilename(target)!,
          releaseArtifactFilename: getLatestUpdateFilename(target)!,
          productName,
          version,
          optional: true,
        },
      ]
    case 'x86_64-unknown-linux-gnu':
    case 'aarch64-unknown-linux-gnu':
      return getLinuxFilenames(target, electronBuilder, productName, beforeVersion, version)
    case 'aarch64-apple-darwin':
    {
      const artifacts: FilenameOutputEntry[] = [
        {
          target: 'aarch64-apple-darwin',
          extension: 'dmg',
          outputFilename: applyTemplateOfArtifactName(
            electronBuilder.dmg!.artifactName!,
            productName,
            beforeVersion,
            mapArchFor(target, 'dmg'),
            'dmg',
          ),
          releaseArtifactFilename: applyTemplateOfArtifactName(
            electronBuilder.dmg!.artifactName!,
            productName,
            version,
            mapArchFor(target, 'dmg'),
            'dmg',
          ),
          productName,
          version,
        },
      ]

      artifacts.push(
        {
          target: 'aarch64-apple-darwin',
          extension: 'zip',
          outputFilename: getMacZipFilename(productName, beforeVersion, target),
          releaseArtifactFilename: getMacZipFilename(productName, version, target),
          productName,
          version,
        },
        {
          target: 'aarch64-apple-darwin',
          extension: getLatestUpdateFilename(target)!,
          outputFilename: getLatestUpdateFilename(target)!,
          releaseArtifactFilename: getLatestUpdateFilename(target)!,
          productName,
          version,
          optional: true,
        },
      )

      return artifacts
    }
    case 'x86_64-apple-darwin':
    {
      const artifacts: FilenameOutputEntry[] = [
        {
          target: 'x86_64-apple-darwin',
          extension: 'dmg',
          outputFilename: applyTemplateOfArtifactName(
            electronBuilder.dmg!.artifactName!,
            productName,
            beforeVersion,
            mapArchFor(target, 'dmg'),
            'dmg',
          ),
          releaseArtifactFilename: applyTemplateOfArtifactName(
            electronBuilder.dmg!.artifactName!,
            productName,
            version,
            mapArchFor(target, 'dmg'),
            'dmg',
          ),
          productName,
          version,
        },
      ]

      artifacts.push(
        {
          target: 'x86_64-apple-darwin',
          extension: 'zip',
          outputFilename: getMacZipFilename(productName, beforeVersion, target),
          releaseArtifactFilename: getMacZipFilename(productName, version, target),
          productName,
          version,
        },
        {
          target: 'x86_64-apple-darwin',
          extension: getLatestUpdateFilename(target)!,
          outputFilename: getLatestUpdateFilename(target)!,
          releaseArtifactFilename: getLatestUpdateFilename(target)!,
          productName,
          version,
          optional: true,
        },
      )

      return artifacts
    }
    default:
      console.error('Target is not supported')
      process.exit(1)
  }
}
