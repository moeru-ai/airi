import fs from 'node:fs'
import path from 'node:path'

import JSZip from 'jszip'

/**
 * Minimal test harness to verify Live2D ZIP structure and model3.json references
 * Run with: pnpm tsx packages/stage-ui-live2d/src/utils/test-zip-harness.ts <path-to-zip>
 */

async function testZip(zipPath: string) {
  console.log(`\n--- Testing Live2D ZIP: ${path.basename(zipPath)} ---\n`)

  if (!fs.existsSync(zipPath)) {
    console.error(`Error: File not found at ${zipPath}`)
    process.exit(1)
  }

  const data = fs.readFileSync(zipPath)
  const zip = await JSZip.loadAsync(data)

  const files: string[] = []
  zip.forEach((relativePath, file) => {
    if (!file.dir) {
      files.push(relativePath)
    }
  })

  console.log(`Found ${files.length} files in ZIP:`)
  files.forEach(f => console.log(`  - ${f}`))

  const settingsFile = files.find(f => f.endsWith('model3.json'))
  if (!settingsFile) {
    console.warn('\n[!] WARNING: No .model3.json found at root.')
    console.log('    The app will attempt to generate "fake settings" automatically.')

    const mocFiles = files.filter(f => f.endsWith('.moc3'))
    if (mocFiles.length !== 1) {
      console.error(`\n[X] FAILED: Expected exactly one .moc3 file for fake settings, found ${mocFiles.length}`)
      process.exit(1)
    }
    console.log(`\n[V] SUCCESS: Found unique MOC: ${mocFiles[0]}`)
    return
  }

  console.log(`\n[V] Found settings file: ${settingsFile}`)

  try {
    const content = await zip.file(settingsFile)!.async('text')
    const json = JSON.parse(content)
    console.log('    Successfully parsed JSON.')

    const moc = json.FileReferences?.Moc
    const textures = json.FileReferences?.Textures || []

    let allOk = true

    if (moc) {
      const mocPath = path.posix.join(path.posix.dirname(settingsFile), moc)
      if (files.includes(mocPath)) {
        console.log(`    [V] MOC file exists: ${mocPath}`)
      }
      else {
        console.error(`    [X] MISSING MOC file: ${mocPath} (referenced in JSON)`)
        allOk = false
      }
    }
    else {
      console.error('    [X] MISSING "Moc" reference in FileReferences')
      allOk = false
    }

    textures.forEach((tex: string, i: number) => {
      const texPath = path.posix.join(path.posix.dirname(settingsFile), tex)
      if (files.includes(texPath)) {
        console.log(`    [V] Texture ${i} exists: ${texPath}`)
      }
      else {
        console.error(`    [X] MISSING Texture ${i}: ${texPath} (referenced in JSON)`)
        allOk = false
      }
    })

    if (allOk) {
      console.log('\n--- VERIFICATION RESULT: SUCCESS ---')
      console.log('This ZIP structure is valid and should load correctly in AIRI.')
    }
    else {
      console.log('\n--- VERIFICATION RESULT: FAILED ---')
      console.log('Please fix the missing references listed above.')
    }
  }
  catch (err: any) {
    console.error(`\n[X] FAILED: Error parsing or reading settings file: ${err.message}`)
  }
}

const target = process.argv[2]
if (!target) {
  console.log('Usage: pnpm tsx packages/stage-ui-live2d/src/utils/test-zip-harness.ts <zip-path>')
}
else {
  testZip(target).catch(console.error)
}
