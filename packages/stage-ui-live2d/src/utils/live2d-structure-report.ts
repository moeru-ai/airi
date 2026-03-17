import fs from 'node:fs'
import path from 'node:path'

import JSZip from 'jszip'

/**
 * Enhanced reporting utility to analyze and validate Live2D ZIP structures.
 */

async function generateReport(zipPath: string) {
  console.log(`\n================================================================`)
  console.log(`LIVE2D STRUCTURE REPORT: ${path.basename(zipPath)}`)
  console.log(`================================================================\n`)

  if (!fs.existsSync(zipPath)) {
    console.error(`Error: File not found at ${zipPath}`)
    process.exit(1)
  }

  const data = fs.readFileSync(zipPath)
  const zip = await JSZip.loadAsync(data)
  const allFiles = Object.keys(zip.files)

  const report = {
    zipPath,
    totalFiles: allFiles.length,
    entryPoint: null as string | null,
    structureType: 'Unknown',
    issues: [] as string[],
    checks: [] as string[],
    metadata: {
      moc: null as string | null,
      textures: [] as string[],
      physics: null as string | null,
      pose: null as string | null,
      cdi: null as string | null,
      expressions: [] as string[],
      motions: [] as string[],
    },
  }

  // 1. Enumerate Files and Check Non-ASCII
  console.log(`[1] Enumerating ${allFiles.length} files...`)
  allFiles.forEach((f) => {
    if (/[^\x00-\x7F]/.test(f)) {
      report.issues.push(`Non-ASCII filename detected: "${f}" (Ensure middleware handles this)`)
    }
  })

  // 2. Identify Entry Point
  const settingsFiles = allFiles.filter(f => f.endsWith('.model3.json'))
  if (settingsFiles.length > 0) {
    report.entryPoint = settingsFiles[0]
    report.structureType = 'Standard (model3.json)'
    if (settingsFiles.length > 1) {
      report.issues.push(`Multiple .model3.json files found. Using: ${settingsFiles[0]}`)
    }
    report.checks.push(`Entry point identified: ${report.entryPoint}`)
  }
  else {
    report.structureType = 'Heuristic (Loose Files)'
    const mocFiles = allFiles.filter(f => f.endsWith('.moc3'))
    if (mocFiles.length === 1) {
      report.checks.push(`Heuristic match found: Unique MOC file ${mocFiles[0]}`)
    }
    else {
      report.issues.push(`Heuristic failure: Found ${mocFiles.length} .moc3 files (Exactly 1 required)`)
    }
  }

  // 3. Validation
  if (report.entryPoint) {
    try {
      const content = await zip.file(report.entryPoint)!.async('text')
      const json = JSON.parse(content)
      report.checks.push(`Successfully parsed ${path.basename(report.entryPoint)}`)

      const baseDir = path.posix.dirname(report.entryPoint)
      const refs = json.FileReferences || {}

      // MOC
      if (refs.Moc) {
        const mocPath = path.posix.join(baseDir, refs.Moc)
        if (allFiles.includes(mocPath)) {
          report.metadata.moc = mocPath
          report.checks.push(`MOC file exists: ${mocPath}`)
        }
        else {
          report.issues.push(`Missing MOC file: ${mocPath} (referenced in JSON)`)
        }
      }

      // Textures
      if (Array.isArray(refs.Textures)) {
        refs.Textures.forEach((tex: string, i: number) => {
          const texPath = path.posix.join(baseDir, tex)
          if (allFiles.includes(texPath)) {
            report.metadata.textures.push(texPath)
          }
          else {
            report.issues.push(`Missing Texture ${i}: ${texPath} (referenced in JSON)`)
          }
        })
        report.checks.push(`Verified ${report.metadata.textures.length}/${refs.Textures.length} textures`)
      }

      // Physics
      if (refs.Physics) {
        const physPath = path.posix.join(baseDir, refs.Physics)
        if (allFiles.includes(physPath)) {
          report.metadata.physics = physPath
          report.checks.push(`Physics file exists: ${physPath}`)
        }
        else {
          report.issues.push(`Missing Physics file: ${physPath} (referenced in JSON)`)
        }
      }

      // DisplayInfo (CDI)
      if (refs.DisplayInfo) {
        const cdiPath = path.posix.join(baseDir, refs.DisplayInfo)
        if (allFiles.includes(cdiPath)) {
          report.metadata.cdi = cdiPath
          report.checks.push(`CDI file exists: ${cdiPath}`)
        }
        else {
          report.issues.push(`Missing CDI file: ${cdiPath} (referenced in JSON)`)
        }
      }

      // Expressions
      if (Array.isArray(refs.Expressions)) {
        refs.Expressions.forEach((exp: any) => {
          const expFile = typeof exp === 'string' ? exp : exp.File
          const expPath = path.posix.join(baseDir, expFile)
          if (allFiles.includes(expPath)) {
            report.metadata.expressions.push(expPath)
          }
          else {
            report.issues.push(`Missing Expression: ${expPath} (referenced in JSON)`)
          }
        })
      }
    }
    catch (e: any) {
      report.issues.push(`Failed to parse ${report.entryPoint}: ${e.message}`)
    }
  }

  // 4. Global Discovery (ZIP-wide scanning as per ZipLoader)
  const cdiFiles = allFiles.filter(f => f.toLowerCase().endsWith('.cdi3.json'))
  if (cdiFiles.length > 0 && !report.metadata.cdi) {
    report.checks.push(`Auto-discovered CDI: ${cdiFiles[0]}`)
  }

  const expFiles = allFiles.filter(f => f.toLowerCase().endsWith('.exp3.json'))
  expFiles.forEach((f) => {
    if (!report.metadata.expressions.includes(f)) {
      report.metadata.expressions.push(f)
    }
  })
  report.checks.push(`Total Expressions found: ${report.metadata.expressions.length}`)

  const motionFiles = allFiles.filter(f => f.toLowerCase().endsWith('.motion3.json') || f.toLowerCase().endsWith('.mtn'))
  report.metadata.motions = motionFiles
  report.checks.push(`Total Motions found: ${report.metadata.motions.length}`)

  // Final Summary
  console.log(`[2] SUMMARY`)
  console.log(`    Type: ${report.structureType}`)
  console.log(`    Status: ${report.issues.length === 0 ? 'VALID' : 'INVALID'}`)

  if (report.checks.length > 0) {
    console.log(`\n[3] CHECKS PASSED:`)
    report.checks.forEach(c => console.log(`    [V] ${c}`))
  }

  if (report.issues.length > 0) {
    console.log(`\n[4] ISSUES FOUND:`)
    report.issues.forEach(i => console.log(`    [X] ${i}`))
  }

  console.log(`\n================================================================\n`)
}

const target = process.argv[2]
if (!target) {
  console.log('Usage: node_modules/.bin/tsx packages/stage-ui-live2d/src/utils/live2d-structure-report.ts <zip-path>')
}
else {
  generateReport(target).catch(console.error)
}
