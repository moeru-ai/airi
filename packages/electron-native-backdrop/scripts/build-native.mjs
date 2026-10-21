import { spawnSync } from 'node:child_process'
import { accessSync, constants, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { arch, env, execPath, platform } from 'node:process'
import { fileURLToPath } from 'node:url'

if (platform === 'darwin') {
  if (arch !== 'arm64' && arch !== 'x64')
    throw new Error(`Cannot build the native backdrop for ${arch}`)

  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const headers = env.NODE_HEADERS ?? resolve(dirname(execPath), '..', 'include', 'node')
  accessSync(resolve(headers, 'node_api.h'), constants.R_OK)
  const outputDir = resolve(packageRoot, 'dist', `darwin-${arch}`)
  mkdirSync(outputDir, { recursive: true })

  const result = spawnSync('xcrun', [
    'clang++',
    '-bundle',
    '-undefined',
    'dynamic_lookup',
    '-std=c++17',
    '-fobjc-arc',
    '-mmacosx-version-min=14.0',
    '-arch',
    arch === 'x64' ? 'x86_64' : 'arm64',
    '-DNAPI_VERSION=8',
    '-DNODE_GYP_MODULE_NAME=airi_native_backdrop',
    '-I',
    headers,
    '-framework',
    'Cocoa',
    '-framework',
    'QuartzCore',
    resolve(packageRoot, 'native', 'backdrop.mm'),
    '-o',
    resolve(outputDir, 'backdrop.node'),
  ], { stdio: 'inherit' })
  if (result.error)
    throw result.error
  if (result.status !== 0)
    throw new Error(`Native backdrop compilation failed with status ${result.status}`)
}
