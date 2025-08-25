import process from 'node:process'

import { execSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Check if a path is a symbolic link.
 * @param path - Path to check
 */
function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink()
  }
  catch {
    return false
  }
}

let symlinkCreatedPath = '' // Track only if we create a symlink
try {
  if (process.platform !== 'linux') {
    process.exit(0)
  }

  const appDir = '../../target/release/bundle/appimage/AIRI.AppDir'
  console.log(`[AIRI-AppImage] Fixing AppImage at: ${appDir}`)

  const tmpDir = '/tmp/airi-build-temp'
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir)
  }

  const archMap: Partial<Record<NodeJS.Architecture, string>> = {
    x64: 'x86_64',
    arm64: 'aarch64',
    arm: 'armhf',
    ia32: 'i386',
  }
  const mappedArch: string = archMap[process.arch] ?? process.arch

  const linuxdeployUrl = `https://github.com/linuxdeploy/linuxdeploy/releases/download/1-alpha-20250213-2/linuxdeploy-${mappedArch}.AppImage`
  const gstreamerPluginUrl = `https://raw.githubusercontent.com/linuxdeploy/linuxdeploy-plugin-gstreamer/refs/heads/master/linuxdeploy-plugin-gstreamer.sh`

  const linuxdeployPath = join(tmpDir, `linuxdeploy-${mappedArch}.AppImage`)
  const gstreamerPluginPath = join(tmpDir, 'linuxdeploy-plugin-gstreamer.sh')

  console.log('[AIRI-AppImage] Downloading linuxdeploy and plugin...')
  execSync(`curl -fL -o "${linuxdeployPath}" "${linuxdeployUrl}"`, { stdio: 'inherit' })
  execSync(`chmod +x "${linuxdeployPath}"`, { stdio: 'inherit' })
  execSync(`curl -fL -o "${gstreamerPluginPath}" "${gstreamerPluginUrl}"`, { stdio: 'inherit' })
  execSync(`chmod +x "${gstreamerPluginPath}"`, { stdio: 'inherit' })

  // --- Determine host GStreamer path ---
  let hostGstPath = ''

  if (existsSync('/usr/lib/gstreamer-1.0')) {
    hostGstPath = '/usr/lib/gstreamer-1.0'
  }
  else if (existsSync('/usr/lib64/gstreamer-1.0')) {
    hostGstPath = '/usr/lib64/gstreamer-1.0'

    // Create /usr/lib -> /usr/lib64 symlink if needed
    console.log('[AIRI-AppImage] Creating /usr/lib -> /usr/lib64 symlink for plugin script...')
    try {
      execSync('sudo mkdir -p /usr/lib', { stdio: 'ignore' })
      execSync('sudo ln -sf /usr/lib64/gstreamer-1.0 /usr/lib/gstreamer-1.0', { stdio: 'ignore' })
      symlinkCreatedPath = '/usr/lib/gstreamer-1.0'
    }
    catch {
      console.warn('[AIRI-AppImage] Failed to create symlink. You may need sudo permissions.')
    }
    console.log('[AIRI-AppImage] Symlink step completed.')
  }
  else {
    console.error('Error: No GStreamer plugins found in /usr/lib or /usr/lib64 on host system.')
    process.exit(1)
  }

  // --- Patch plugin script to use /usr/lib64 if necessary ---
  if (!existsSync('/usr/lib/gstreamer-1.0') && existsSync('/usr/lib64/gstreamer-1.0')) {
    console.log('[AIRI-AppImage] Patching gstreamer plugin script for /usr/lib64...')
    execSync(`sed -i 's|/usr/lib/gstreamer-1.0|/usr/lib64/gstreamer-1.0|g' "${gstreamerPluginPath}"`)
  }

  // --- Environment setup ---
  const env = { ...process.env }
  env.GST_PLUGIN_PATH = hostGstPath
  env.LINUXDEPLOY = linuxdeployPath

  // --- Determine library path within AppDir ---
  let appLibPath = 'lib'
  if (existsSync(join(appDir, 'usr', 'lib64', 'gstreamer-1.0'))) {
    appLibPath = 'lib64'
  }

  env.LD_LIBRARY_PATH = `${join(appDir, 'usr', appLibPath)}:${env.LD_LIBRARY_PATH || ''}`
  env.XDG_DATA_DIRS = `${join(appDir, 'usr/share')}:${join(appDir, 'usr/local/share')}:${env.XDG_DATA_DIRS || ''}`
  env.GSETTINGS_SCHEMA_DIR = `${join(appDir, 'usr/share/glib-2.0/schemas')}`
  env.GST_PLUGIN_SCANNER = `${join(appDir, 'usr', appLibPath, 'gstreamer-1.0', 'gst-plugin-scanner')}`

  console.log('[AIRI-AppImage] Fix process starting...')
  execSync(`${gstreamerPluginPath} --appdir "${appDir}"`, { stdio: 'inherit', env })
  console.log('[AIRI-AppImage] Fix completed.')

  execSync(`${linuxdeployPath} --appdir "${appDir}" --no-strip --plugin gstreamer`, { stdio: 'inherit', env })
  execSync(`${linuxdeployPath} --appdir "${appDir}" --output appimage; mv ./AIRI-${mappedArch}.AppImage ${appDir}/../`, { stdio: 'inherit', env })
}
catch (error) {
  console.error('An error occurred during the process:', error)
  process.exit(1)
}
finally {
  const tmpDir = '/tmp/airi-build-temp'
  if (existsSync(tmpDir)) {
    console.log('[AIRI-AppImage] Cleaning up temporary files...')
    rmSync(tmpDir, { recursive: true, force: true })
    console.log('[AIRI-AppImage] Cleanup completed.')
  }

  // --- Safely remove host symlink only if it exists and was created by this script ---
  const symlinkPath = '/usr/lib/gstreamer-1.0'
  if (symlinkCreatedPath && isSymlink(symlinkPath)) {
    try {
      execSync(`sudo rm -f ${symlinkPath}`)
      console.log('[AIRI-AppImage] Host symlink removed.')
    }
    catch {
      console.warn('[AIRI-AppImage] Failed to remove host symlink. Please remove manually.')
    }
  }
}
