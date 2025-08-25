import process from 'node:process'

import { execSync } from 'node:child_process'
import { join } from 'node:path'

try {
  if (process.platform === 'linux') {
    // Tauri sets these environment variables during the build process.
    const appDir = process.env.TAURI_BUNDLER_APPDIR
    const linuxdeployPath = process.env.TAURI_BUNDLER_LINUXDEPLOY_BIN

    // Verify that the necessary paths are available.
    if (!appDir || !linuxdeployPath) {
      console.error('Error: Required Tauri build environment variables are missing.')
      console.error(`TAURI_BUNDLER_APPDIR: ${appDir}`)
      console.error(`TAURI_BUNDLER_LINUXDEPLOY_BIN: ${linuxdeployPath}`)
      process.exit(1)
    }

    console.log(`[AIRI-AppImage] Fixing AppImage at: ${appDir}`)

    // Set environment variables for the GStreamer plugin.
    const env = { ...process.env }
    env.LINUXDEPLOY = linuxdeployPath
    const arch = process.arch === 'x64' ? 'x86_64' : process.arch

    env.LD_LIBRARY_PATH = `${join(appDir, 'usr/lib', `${arch}-linux-gnu`)}:${env.LD_LIBRARY_PATH || ''}`
    env.XDG_DATA_DIRS = `${join(appDir, 'usr/share')}:${join(appDir, 'usr/local/share')}:${env.XDG_DATA_DIRS || ''}`
    env.GSETTINGS_SCHEMA_DIR = `${join(appDir, 'usr/share/glib-2.0/schemas')}`
    env.GST_PLUGIN_PATH = `${join(appDir, 'usr/lib', `${arch}-linux-gnu/gstreamer-1.0`)}`
    env.GST_PLUGIN_SCANNER = `${join(appDir, 'usr/lib', `${arch}-linux-gnu/gstreamer-1.0/gst-plugin-scanner`)}`

    // Run the GStreamer plugin command.
    console.log('[AIRI-AppImage] Including GStreamer plugins')
    execSync(`linuxdeploy-plugin-gstreamer --appdir "${appDir}"`, { stdio: 'inherit', env })

    console.log('[AIRI-AppImage] Fix completed.')
  }
}
catch (error) {
  console.error('An error occurred during the process:', error)
  process.exit(1)
}
