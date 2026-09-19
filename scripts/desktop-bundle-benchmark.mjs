import process from 'node:process'

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, readdirSync, readFileSync } from 'node:fs'
import { access, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const benchmarkRoot = join(root, 'docs/ai/benchmarks/desktop-bundle-size')
const appRoot = process.env.DESKTOP_BUNDLE_APP_ROOT
  ? resolve(process.env.DESKTOP_BUNDLE_APP_ROOT)
  : join(root, 'apps/stage-tamagotchi')
const outputRoot = join(appRoot, 'out')
const packageRoot = join(appRoot, 'dist/mac-arm64/airi.app')
const resourcesRoot = join(packageRoot, 'Contents/Resources')
const asarPath = join(resourcesRoot, 'app.asar')
const unpackedRoot = join(resourcesRoot, 'app.asar.unpacked')

const remoteModelUrls = {
  'preset-live2d-2': 'https://dist.ayaka.moe/live2d-models/hiyori_free_zh.zip',
  'preset-vrm-1': 'https://dist.ayaka.moe/vrm-models/VRoid-Hub/AvatarSample-A/AvatarSample_A.vrm',
  'preset-vrm-2': 'https://dist.ayaka.moe/vrm-models/VRoid-Hub/AvatarSample-B/AvatarSample_B.vrm',
}

function readArgument(name, fallback) {
  const prefix = `${name}=`
  const argument = process.argv.slice(2).find(value => value.startsWith(prefix))
  return argument ? argument.slice(prefix.length) : fallback
}

const experimentId = readArgument('--experiment', 'baseline')
const manifestRoot = join(benchmarkRoot, 'manifests', experimentId)

async function pathExists(path) {
  try {
    await access(path)
    return true
  }
  catch {
    return false
  }
}

async function hashFile(filePath) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}

async function fileRecord(filePath, basePath, includeHash) {
  const fileStat = await stat(filePath)
  const record = {
    path: relative(basePath, filePath),
    bytes: fileStat.size,
  }
  if (includeHash)
    record.sha256 = await hashFile(filePath)
  return record
}

async function collectFiles(directory, basePath = directory, includeHash = true) {
  const entries = await readdir(directory, { withFileTypes: true })
  const records = []

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      records.push(...await collectFiles(entryPath, basePath, includeHash))
    }
    else if (entry.isFile()) {
      records.push(await fileRecord(entryPath, basePath, includeHash))
    }
  }

  return records
}

async function measureDirectory(path, label, manifestName, options = {}) {
  if (!await pathExists(path)) {
    return {
      label,
      path: relative(root, path),
      exists: false,
      bytes: 0,
      fileCount: 0,
    }
  }

  const files = await collectFiles(path, path, options.includeHash ?? true)
  const bytes = files.reduce((total, file) => total + file.bytes, 0)
  const manifestPath = join(manifestRoot, manifestName)
  await writeJson(manifestPath, {
    schemaVersion: 1,
    label,
    path: relative(root, path),
    bytes,
    fileCount: files.length,
    files,
  })

  return {
    label,
    path: relative(root, path),
    exists: true,
    bytes,
    fileCount: files.length,
    manifest: relative(root, manifestPath),
  }
}

async function measureFile(path, label) {
  try {
    const fileStat = await stat(path)
    return {
      label,
      path: relative(root, path),
      exists: true,
      bytes: fileStat.size,
      sha256: await hashFile(path),
    }
  }
  catch {
    return {
      label,
      path: relative(root, path),
      exists: false,
    }
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

function commandOutput(command, args) {
  try {
    return {
      command: [command, ...args].join(' '),
      status: 'success',
      output: execFileSync(command, args, { cwd: root, encoding: 'utf8' }).trim(),
    }
  }
  catch (error) {
    return {
      command: [command, ...args].join(' '),
      status: 'unavailable',
      output: String(error),
    }
  }
}

function packageVersion(packageName) {
  try {
    let packagePath = join(appRoot, 'node_modules', packageName, 'package.json')
    try {
      readFileSync(packagePath, 'utf8')
    }
    catch {
      const virtualStoreEntry = readdirSync(join(root, 'node_modules/.pnpm')).find(entry => entry.startsWith(`${packageName.replace('/', '+')}@`))
      if (!virtualStoreEntry)
        return null
      packagePath = join(root, 'node_modules/.pnpm', virtualStoreEntry, 'node_modules', packageName, 'package.json')
    }
    return JSON.parse(readFileSync(packagePath, 'utf8')).version
  }
  catch {
    return null
  }
}

function asarEntryCount(path) {
  try {
    const output = execFileSync('pnpm', ['dlx', '@electron/asar@3.4.1', 'list', path], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    return {
      command: `pnpm dlx @electron/asar@3.4.1 list ${relative(root, path)}`,
      status: 'success',
      entries: output.trim().split('\n').length,
    }
  }
  catch (error) {
    return {
      command: `pnpm dlx @electron/asar@3.4.1 list ${relative(root, path)}`,
      status: 'unavailable',
      output: String(error),
    }
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  }
  catch {
    return undefined
  }
}

function artifactComparison(artifacts, baseline) {
  if (!baseline)
    return { status: 'not-available' }

  const baselineByLabel = new Map(baseline.artifacts.map(artifact => [artifact.label, artifact]))
  return {
    status: 'measured',
    artifacts: artifacts.map((artifact) => {
      const baselineArtifact = baselineByLabel.get(artifact.label)
      if (!baselineArtifact || artifact.exists === false || baselineArtifact.exists === false)
        return { label: artifact.label, status: 'not-comparable' }
      const deltaBytes = artifact.bytes - baselineArtifact.bytes
      return {
        label: artifact.label,
        baselineBytes: baselineArtifact.bytes,
        bytes: artifact.bytes,
        deltaBytes,
        deltaRatio: baselineArtifact.bytes === 0 ? null : deltaBytes / baselineArtifact.bytes,
      }
    }),
  }
}

function targetOnnxPaths() {
  return `${process.platform}/${process.arch}`
}

async function inspectPayload(rendererFiles, unpackedFiles) {
  const allFiles = rendererFiles.map(file => ({ ...file, source: 'out/renderer' })).concat(unpackedFiles.map(file => ({ ...file, source: 'app.asar.unpacked' })))
  const nativeFiles = allFiles.filter(file => /\.(?:node|dylib|so(?:\.\d+)*|dll)$/i.test(file.path))
  const assetFiles = allFiles.filter(file => /\.(?:wasm|ttf|woff2?|vrm|vrma|zip)$/i.test(file.path))
  const onnxNodeFiles = allFiles.filter(file => file.path.includes('onnxruntime-node/'))
  const foreignOnnxFiles = onnxNodeFiles.filter(file => !file.path.includes(`/${targetOnnxPaths()}/`))
  const foreignNativeFiles = nativeFiles.filter((file) => {
    if (file.path.includes('uiohook-napi/prebuilds/'))
      return !file.path.includes(`uiohook-napi/prebuilds/${process.platform}-${process.arch}/`)

    if (file.path.includes('electron-click-drag-plugin/build/Release/'))
      return !file.path.includes(`electron-click-drag-plugin/build/Release/${process.platform}-${process.arch}/`)

    return false
  })
  const rendererRoot = join(outputRoot, 'renderer')
  const rendererJavaScript = rendererFiles
    .filter(file => /\.(?:js|mjs)$/i.test(file.path))
    .map(file => join(rendererRoot, file.path))
  const browserImportViolations = []
  for (const filePath of rendererJavaScript) {
    const source = (await readFile(filePath, 'utf8'))
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    if (/onnxruntime-node|transformers\.node/i.test(source))
      browserImportViolations.push(relative(root, filePath))
  }

  const bundledModels = assetFiles.filter(file => /hiyori|AvatarSample/i.test(file.path))
  const fonts = assetFiles.filter(file => /Xiaolai|cjkFonts|font-cjkfonts|font-xiaolai/i.test(file.path))
  const wasm = assetFiles.filter(file => /ort-wasm|onnxruntime/i.test(file.path))
  const checks = {
    browserTransformerImport: {
      status: browserImportViolations.length === 0 ? 'pass' : 'fail',
      violations: browserImportViolations,
    },
    onnxRuntimeNodeExcluded: {
      status: onnxNodeFiles.length === 0 ? 'pass' : 'fail',
      target: targetOnnxPaths(),
      files: onnxNodeFiles,
    },
    foreignOnnxBinaryExcluded: {
      status: foreignOnnxFiles.length === 0 ? 'pass' : 'fail',
      files: foreignOnnxFiles,
    },
    foreignNativeBinaryExcluded: {
      status: foreignNativeFiles.length === 0 ? 'pass' : 'fail',
      files: foreignNativeFiles,
    },
    browserOnnxWasmPresent: {
      status: wasm.length > 0 ? 'pass' : 'fail',
      files: wasm,
    },
    desktopSpecialFontsExcluded: {
      status: fonts.length === 0 ? 'pass' : 'fail',
      files: fonts,
    },
  }

  return {
    nativeFiles,
    assetFiles,
    bundledModels,
    remoteModels: Object.entries(remoteModelUrls).map(([id, url]) => ({ id, url })),
    fonts,
    wasm,
    checks,
    status: Object.values(checks).every(check => check.status === 'pass') ? 'pass' : 'fail',
  }
}

async function measureInstallers() {
  const distRoot = join(appRoot, 'dist')
  if (!await pathExists(distRoot))
    return []
  const files = await collectFiles(distRoot, distRoot, true)
  return files
    .filter(file => file.path !== 'builder-debug.yml' && !file.path.includes('app.asar') && /\.(?:dmg|exe|appimage|deb|rpm|zip|blockmap|yml)$/i.test(file.path))
    .map(file => ({ ...file, path: join('apps/stage-tamagotchi/dist', file.path) }))
}

const gitCommit = commandOutput('git', ['rev-parse', 'HEAD']).output
const gitStatus = commandOutput('git', ['status', '--short']).output
const nodeVersion = commandOutput('node', ['--version']).output
const pnpmVersion = commandOutput('pnpm', ['--version']).output
const envinfo = commandOutput('pnpm', ['dlx', 'envinfo', '--system', '--binaries', '--npmPackages', 'electron,electron-builder,electron-vite,vite,rollup,rolldown,pnpm'])
const env = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  repository: {
    commit: gitCommit,
    status: gitStatus,
  },
  system: {
    platform: process.platform,
    arch: process.arch,
    node: nodeVersion,
    pnpm: pnpmVersion,
    ci: process.env.CI === 'true',
    cache: 'warm',
    filesystem: 'local workspace filesystem',
    buildTarget: `${process.platform} ${process.arch} unpacked application`,
  },
  commands: {
    envinfo,
    build: 'pnpm -F @proj-airi/stage-tamagotchi build:unpack',
    asarList: 'pnpm dlx @electron/asar@3.4.1 list apps/stage-tamagotchi/dist/mac-arm64/airi.app/Contents/Resources/app.asar',
  },
  packages: {
    electron: packageVersion('electron'),
    electronBuilder: packageVersion('electron-builder'),
    electronVite: packageVersion('electron-vite'),
    vite: packageVersion('vite'),
    rollup: packageVersion('rollup'),
    rolldown: packageVersion('rolldown'),
  },
}

const measuredArtifacts = [
  await measureDirectory(join(outputRoot, 'main'), 'renderer build main output', 'out-main.json'),
  await measureDirectory(join(outputRoot, 'preload'), 'renderer build preload output', 'out-preload.json'),
  await measureDirectory(join(outputRoot, 'renderer'), 'renderer build output', 'out-renderer.json'),
  await measureDirectory(outputRoot, 'complete renderer build output', 'out.json'),
  await measureDirectory(unpackedRoot, 'ASAR unpacked application directory', 'app-asar-unpacked.json'),
  await measureDirectory(packageRoot, 'unpacked macOS application', 'macos-app.json', { includeHash: false }),
  await measureFile(asarPath, 'application ASAR'),
]

const rendererManifest = readJson(join(manifestRoot, 'out-renderer.json')) ?? { files: [] }
const unpackedManifest = readJson(join(manifestRoot, 'app-asar-unpacked.json')) ?? { files: [] }
const payload = await inspectPayload(rendererManifest.files, unpackedManifest.files)
const installers = await measureInstallers()
await writeJson(join(manifestRoot, 'native-and-asset-payload.json'), {
  schemaVersion: 1,
  note: 'Native binaries and large runtime assets from the renderer and unpacked application manifests.',
  target: targetOnnxPaths(),
  files: payload.nativeFiles.concat(payload.assetFiles).sort((left, right) => right.bytes - left.bytes),
  checks: payload.checks,
})

const baseline = experimentId === 'baseline' ? undefined : readJson(join(benchmarkRoot, 'baseline.json'))
const runtimeMetricsPath = process.env.DESKTOP_RUNTIME_METRICS_FILE
const runtimeMetrics = runtimeMetricsPath ? readJson(resolve(root, runtimeMetricsPath)) : undefined
const runtime = runtimeMetrics ?? {
  status: 'not-measured',
  reason: 'Pass DESKTOP_RUNTIME_METRICS_FILE after three cold and three warm packaged runs.',
  requiredMeasurements: ['appWhenReadyMs', 'browserWindowCreationMs', 'firstPaintMs', 'firstUsableUiMs', 'defaultModelLoadMs', 'onnxInitializationMs'],
}
const result = {
  schemaVersion: 2,
  experimentId,
  capturedAt: env.capturedAt,
  commit: gitCommit,
  platform: `${process.platform}-${process.arch}`,
  build: {
    command: env.commands.build,
    target: env.system.buildTarget,
    signing: 'unsigned; CSC_IDENTITY_AUTO_DISCOVERY=false',
  },
  artifacts: measuredArtifacts,
  installers,
  asar: asarEntryCount(asarPath),
  payload,
  modelDelivery: {
    bundled: payload.bundledModels,
    remote: payload.remoteModels,
    defaultPreset: 'preset-live2d-1',
  },
  fontPayload: payload.fonts,
  runtime,
  comparison: artifactComparison(measuredArtifacts, baseline),
}

await writeJson(join(benchmarkRoot, 'environment.json'), env)
await writeJson(join(benchmarkRoot, `experiments/${experimentId}.json`), result)
if (experimentId === 'baseline')
  await writeJson(join(benchmarkRoot, 'baseline.json'), result)
if (experimentId === 'baseline')
  await writeJson(join(benchmarkRoot, 'experiments/baseline.json'), result)

console.info(JSON.stringify({ environment: env, result }, null, 2))

if (payload.status === 'fail') {
  console.error('Desktop bundle payload checks failed.')
  process.exitCode = 1
}
