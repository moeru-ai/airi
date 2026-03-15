import type { Configuration } from 'electron-builder'

import process from 'node:process'

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { x } from 'tinyexec'

import * as yaml from 'yaml'

import packageJSON from '../package.json' assert { type: 'json' }

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

export async function getElectronBuilderConfig() {
  return yaml.parse(await readFile(resolve(import.meta.dirname, '..', 'electron-builder.yml'), 'utf-8')) as Configuration
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

export function mapArchFor(
  target: string,
  ext: string,
): string {
  switch (true) {
    case target === 'aarch64-unknown-linux-gnu':
      if (ext === 'rpm') {
        return 'aarch64'
      }
      if (ext === 'deb') {
        return 'arm64'
      }

      return 'arm64'
    case target === 'x86_64-unknown-linux-gnu':
      if (ext === 'rpm') {
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
      return 'latest.yml'
    case 'x86_64-unknown-linux-gnu':
      return 'latest-linux.yml'
    case 'aarch64-unknown-linux-gnu':
      return 'latest-linux-arm64.yml'
    case 'aarch64-apple-darwin':
    case 'x86_64-apple-darwin':
      return 'latest-mac.yml'
    default:
      return null
  }
}

function getMacZipFilename(productName: string, version: string, target: string): string {
  const arch = mapArchFor(target, 'zip')
  const archPrefix = arch === 'x64' ? '' : `${arch}-`
  return `${productName}-${version}-${archPrefix}mac.zip`
}

export async function getFilenames(target: string, options: { release: boolean, autoTag: boolean, tag: string[] }): Promise<FilenameOutputEntry[]> {
  const electronBuilder = await getElectronBuilderConfig()
  const version = await getVersion(options)

  if (!target) {
    throw new Error('<Target> is required')
  }

  const beforeVersion = packageJSON.version
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
          extension: 'latest.yml',
          outputFilename: 'latest.yml',
          releaseArtifactFilename: 'latest.yml',
          productName,
          version,
          optional: true,
        },
      ]
    case 'x86_64-unknown-linux-gnu':
    {
      const artifacts: FilenameOutputEntry[] = []
      if (electronBuilder.linux?.artifactName) {
        if (
          (Array.isArray(electronBuilder.linux.target) && electronBuilder.linux.target.includes('deb'))
          || electronBuilder.linux.target === 'deb'
        ) {
          artifacts.push(
            {
              target: 'x86_64-unknown-linux-gnu',
              extension: 'deb',
              outputFilename: applyTemplateOfArtifactName(
                electronBuilder.linux.artifactName!,
                productName,
                beforeVersion,
                mapArchFor(target, 'deb'),
                'deb',
              ),
              releaseArtifactFilename: applyTemplateOfArtifactName(
                electronBuilder.linux.artifactName!,
                productName,
                version,
                mapArchFor(target, 'deb'),
                'deb',
              ),
              productName,
              version,
            },
          )
        }

        if (
          (Array.isArray(electronBuilder.linux.target) && electronBuilder.linux.target.includes('rpm'))
          || electronBuilder.linux.target === 'rpm'
        ) {
          artifacts.push(
            {
              target: 'x86_64-unknown-linux-gnu',
              extension: 'rpm',
              outputFilename: applyTemplateOfArtifactName(
                electronBuilder.linux.artifactName!,
                productName,
                beforeVersion,
                mapArchFor(target, 'rpm'),
                'rpm',
              ),
              releaseArtifactFilename: applyTemplateOfArtifactName(
                electronBuilder.linux.artifactName!,
                productName,
                version,
                mapArchFor(target, 'rpm'),
                'rpm',
              ),
              productName,
              version,
            },
          )
        }

        // Flatpak artifact (built outside electron-builder, but we follow linux template)
        artifacts.push(
          {
            target: 'x86_64-unknown-linux-gnu',
            extension: 'flatpak',
            outputFilename: applyTemplateOfArtifactName(
              electronBuilder.linux.artifactName!,
              productName,
              beforeVersion,
              mapArchFor(target, 'flatpak'),
              'flatpak',
            ),
            releaseArtifactFilename: applyTemplateOfArtifactName(
              electronBuilder.linux.artifactName!,
              productName,
              version,
              mapArchFor(target, 'flatpak'),
              'flatpak',
            ),
            productName,
            version,
          },
        )
      }

      const latestUpdateFilename = getLatestUpdateFilename(target)
      if (latestUpdateFilename) {
        artifacts.push({
          target: 'x86_64-unknown-linux-gnu',
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
    case 'aarch64-unknown-linux-gnu':
    {
      const artifacts: FilenameOutputEntry[] = []
      if (electronBuilder.linux?.artifactName) {
        if (
          (Array.isArray(electronBuilder.linux.target) && electronBuilder.linux.target.includes('deb'))
          || electronBuilder.linux.target === 'deb'
        ) {
          artifacts.push(
            {
              target: 'aarch64-unknown-linux-gnu',
              extension: 'deb',
              outputFilename: applyTemplateOfArtifactName(
                electronBuilder.linux.artifactName!,
                productName,
                beforeVersion,
                mapArchFor(target, 'deb'),
                'deb',
              ),
              releaseArtifactFilename: applyTemplateOfArtifactName(
                electronBuilder.linux.artifactName!,
                productName,
                version,
                mapArchFor(target, 'deb'),
                'deb',
              ),
              productName,
              version,
            },
          )
        }

        if (
          (Array.isArray(electronBuilder.linux.target) && electronBuilder.linux.target.includes('rpm'))
          || electronBuilder.linux.target === 'rpm'
        ) {
          artifacts.push(
            {
              target: 'aarch64-unknown-linux-gnu',
              extension: 'rpm',
              outputFilename: applyTemplateOfArtifactName(
                electronBuilder.linux.artifactName!,
                productName,
                beforeVersion,
                mapArchFor(target, 'rpm'),
                'rpm',
              ),
              releaseArtifactFilename: applyTemplateOfArtifactName(
                electronBuilder.linux.artifactName!,
                productName,
                version,
                mapArchFor(target, 'rpm'),
                'rpm',
              ),
              productName,
              version,
            },
          )
        }

        // Flatpak artifact (built outside electron-builder, but we follow linux template)
        artifacts.push(
          {
            target: 'aarch64-unknown-linux-gnu',
            extension: 'flatpak',
            outputFilename: applyTemplateOfArtifactName(
              electronBuilder.linux.artifactName!,
              productName,
              beforeVersion,
              mapArchFor(target, 'flatpak'),
              'flatpak',
            ),
            releaseArtifactFilename: applyTemplateOfArtifactName(
              electronBuilder.linux.artifactName!,
              productName,
              version,
              mapArchFor(target, 'flatpak'),
              'flatpak',
            ),
            productName,
            version,
          },
        )
      }

      const latestUpdateFilename = getLatestUpdateFilename(target)
      if (latestUpdateFilename) {
        artifacts.push({
          target: 'aarch64-unknown-linux-gnu',
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
          extension: 'latest-mac.yml',
          outputFilename: 'latest-mac.yml',
          releaseArtifactFilename: 'latest-mac.yml',
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
          extension: 'latest-mac.yml',
          outputFilename: 'latest-mac.yml',
          releaseArtifactFilename: 'latest-mac.yml',
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
