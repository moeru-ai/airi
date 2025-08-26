/**
 * before-build.ts
 * Handles pre-build tasks specifically for AppImage target.
 * Ensures Vite build and build-by-platforms are executed only once
 * and failures are caught without breaking the Tauri pipeline.
 */

import process from 'node:process'

import { execSync } from 'node:child_process'
import { join } from 'node:path'

// Environment variable flag to prevent recursive execution
const FLAG_ENV = 'BEFORE_BUILD_DONE'

// Skip if the script already ran
if (process.env[FLAG_ENV]) {
  console.log('[beforeBuild] Already executed. Skipping...')
  process.exit(0)
}

// Mark as executed
process.env[FLAG_ENV] = '1'

const appDir = join(process.cwd(), 'target', 'release', 'bundle', 'appimage', 'AIRI.AppDir')
const isAppImageBuild = process.env.TAURI_PLATFORM === 'appimage'

console.log('[beforeBuild] Current target:', isAppImageBuild ? 'appimage' : 'non-appimage')

if (isAppImageBuild) {
  console.log('[beforeBuild] Running Vite build for AppImage target...')

  try {
    // Run Vite build directly for AppImage
    execSync('pnpm vite build', { stdio: 'inherit' })
    console.log('[beforeBuild] Vite build completed successfully.')
  }
  catch (error) {
    console.warn('[beforeBuild] Vite build failed, but continuing...', error)
  }

  console.log('[beforeBuild] Running build-by-platforms script...')

  try {
    execSync(`tsx ./scripts/build-by-platforms.ts ${appDir}`, { stdio: 'inherit' })
    console.log('[beforeBuild] build-by-platforms script completed.')
  }
  catch (error) {
    console.error('[beforeBuild] build-by-platforms script failed!', error)
    process.exit(1) // Here failure is fatal
  }
}
else {
  console.log('[beforeBuild] Skipping Vite build for non-AppImage target...')
}
