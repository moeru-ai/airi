import process from 'node:process'

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

try {
  if (process.platform === 'linux') {
    const appDir = '../../target/release/bundle/appimage/AIRI.AppDir' // there is no afterBuildCommand on this tauri version.

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

    // temporarily downoad linuxdeploy.
    const linuxdeployUrl = `https://github.com/linuxdeploy/linuxdeploy/releases/download/1-alpha-20250213-2/linuxdeploy-${mappedArch}.AppImage`
    const gstreamerPluginUrl = `https://raw.githubusercontent.com/linuxdeploy/linuxdeploy-plugin-gstreamer/refs/heads/master/linuxdeploy-plugin-gstreamer.sh`

    const linuxdeployPath = join(tmpDir, `linuxdeploy-${mappedArch}.AppImage`)
    const gstreamerPluginPath = join(tmpDir, 'linuxdeploy-plugin-gstreamer.sh')

    console.log('[AIRI-AppImage] Downloading linuxdeploy and plugin...')

    execSync(`curl -fL -o "${linuxdeployPath}" "${linuxdeployUrl}"`, { stdio: 'inherit' })
    execSync(`chmod +x "${linuxdeployPath}"`, { stdio: 'inherit' })

    execSync(`curl -fL -o "${gstreamerPluginPath}" "${gstreamerPluginUrl}"`, { stdio: 'inherit' })
    execSync(`chmod +x "${gstreamerPluginPath}"`, { stdio: 'inherit' })

    console.log('[AIRI-AppImage] Fix process starting...')

    const env = { ...process.env }
    env.LINUXDEPLOY = linuxdeployPath

    env.LD_LIBRARY_PATH = `${join(appDir, 'usr/lib', `${mappedArch}-linux-gnu`)}:${env.LD_LIBRARY_PATH || ''}`
    env.XDG_DATA_DIRS = `${join(appDir, 'usr/share')}:${join(appDir, 'usr/local/share')}:${env.XDG_DATA_DIRS || ''}`
    env.GSETTINGS_SCHEMA_DIR = `${join(appDir, 'usr/share/glib-2.0/schemas')}`
    env.GST_PLUGIN_PATH = `${join(appDir, 'usr/lib', `${mappedArch}-linux-gnu/gstreamer-1.0`)}`
    env.GST_PLUGIN_SCANNER = `${join(appDir, 'usr/lib', `${mappedArch}-linux-gnu/gstreamer-1.0/gst-plugin-scanner`)}`

    execSync(`${gstreamerPluginPath} --appdir "${appDir}"`, { stdio: 'inherit', env })

    console.log('[AIRI-AppImage] Fix completed.')
    execSync(`${linuxdeployPath} --appdir "${appDir}" --plugin gstreamer`, { stdio: 'inherit', env })
    execSync(`${linuxdeployPath} --appdir "${appDir}"; mv ./AIRI-x86_64.AppImage ${appDir}/../`, { stdio: 'inherit', env })
  }
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
}
