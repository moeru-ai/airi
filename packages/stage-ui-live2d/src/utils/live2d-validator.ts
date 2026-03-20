import JSZip from 'jszip'

export interface Live2DValidationReport {
  fileName: string
  totalFiles: number
  status: 'VALID' | 'WARNING' | 'INVALID'
  entryPoint: string | null
  structureType: 'Standard (model3.json)' | 'Heuristic (Loose Files)' | 'Unknown'
  errors: string[]
  warnings: string[]
  checks: string[]
  mocInfo?: {
    header: string
    ver: number
    size: number
  }
}

export async function validateLive2DZip(file: File | Blob): Promise<Live2DValidationReport> {
  const zip = await JSZip.loadAsync(file)
  const allPaths = Object.keys(zip.files)

  const report: Live2DValidationReport = {
    fileName: (file as File).name || 'live2d-model.zip',
    totalFiles: allPaths.length,
    status: 'VALID',
    entryPoint: null,
    structureType: 'Unknown',
    errors: [],
    warnings: [],
    checks: [],
  }

  // 1. Entry Point Identification
  const model3Files = allPaths.filter(p => p.endsWith('.model3.json'))
  if (model3Files.length > 0) {
    report.entryPoint = model3Files[0]
    report.structureType = 'Standard (model3.json)'
    report.checks.push(`Entry point identified: ${report.entryPoint}`)
  }
  else {
    const mocFiles = allPaths.filter(p => p.endsWith('.moc3'))
    if (mocFiles.length === 1) {
      report.structureType = 'Heuristic (Loose Files)'
      report.checks.push(`Heuristic match found: Unique MOC file ${mocFiles[0]}`)
    }
    else {
      report.errors.push(`Invalid Structure: No .model3.json found and ${mocFiles.length} .moc3 files encountered.`)
    }
  }

  // 2. MOC Header & Size Audit
  const mocPath = allPaths.find(p => p.endsWith('.moc3'))
  if (mocPath) {
    const buf = await zip.file(mocPath)!.async('uint8array')
    const header = String.fromCharCode(...buf.slice(0, 4))
    const ver = buf[4]
    const sizeMb = buf.length / 1024 / 1024

    report.mocInfo = { header, ver, size: buf.length }

    if (header !== 'MOC3') {
      report.errors.push(`Invalid MOC Header: "${header}" (Expected MOC3)`)
    }
    else {
      report.checks.push(`MOC3 Header Valid (Sub-version: ${ver}, Size: ${sizeMb.toFixed(2)} MB)`)
    }

    if (sizeMb > 100) {
      report.warnings.push(`CRITICAL WEIGHT: MOC file is ${sizeMb.toFixed(2)} MB. This "Mega-Model" likely exceeds browser WASM memory limits.`)
    }
    else if (sizeMb > 30) {
      report.warnings.push(`HEAVY RESOURCE: MOC file is ${sizeMb.toFixed(2)} MB. This may cause performance issues in web browsers.`)
    }
  }

  // 3. Basename Collision Audit (AIRI ZipLoader weakness)
  const basenames = new Map<string, string[]>()
  allPaths.forEach((p) => {
    if (p.endsWith('/'))
      return // Skip directories
    const base = p.split(/[\\/]/).pop()!
    if (!basenames.has(base))
      basenames.set(base, [])
    basenames.get(base)!.push(p)
  })

  for (const [base, paths] of basenames.entries()) {
    if (paths.length > 1) {
      report.errors.push(`BASENAME COLLISION: Filename "${base}" exists in multiple locations: ${paths.join(', ')}. This causes data loss in AIRI's loader.`)
    }
  }

  // 4. Detailed Reference Validation
  if (report.entryPoint) {
    try {
      const content = await zip.file(report.entryPoint)!.async('text')
      const json = JSON.parse(content)
      const baseDir = report.entryPoint.split(/[\\/]/).slice(0, -1).join('/')

      const resolve = (rel: string) => {
        if (!rel)
          return ''
        const parts = baseDir ? [...baseDir.split('/'), ...rel.split(/[\\/]/)] : rel.split(/[\\/]/)
        const stack: string[] = []
        for (const p of parts) {
          if (p === '.' || p === '')
            continue
          if (p === '..')
            stack.pop()
          else stack.push(p)
        }
        return stack.join('/')
      }

      const checkRef = (rel: string, type: string) => {
        const full = resolve(rel)
        if (!allPaths.includes(full)) {
          // Check for case-insensitivity match to provide better error
          const fuzzy = allPaths.find(p => p.toLowerCase() === full.toLowerCase())
          if (fuzzy) {
            report.errors.push(`CASE SENSITIVITY MISMATCH: "${rel}" expects "${full}" but ZIP contains "${fuzzy}". Browsers are case-sensitive.`)
          }
          else {
            report.errors.push(`MISSING REFERENCE: ${type} "${rel}" (expected at "${full}") not found in ZIP.`)
          }
        }
      }

      const refs = json.FileReferences || {}
      if (refs.Moc)
        checkRef(refs.Moc, 'MOC')
      if (Array.isArray(refs.Textures)) {
        refs.Textures.forEach((t: string) => checkRef(t, 'Texture'))
      }
      if (refs.Physics)
        checkRef(refs.Physics, 'Physics')
      if (Array.isArray(refs.Expressions)) {
        refs.Expressions.forEach((e: any) => checkRef(typeof e === 'string' ? e : e.File, 'Expression'))
      }
    }
    catch (e: any) {
      report.errors.push(`JSON PARSE ERROR: Failed to parse ${report.entryPoint}: ${e.message}`)
    }
  }

  // 5. Final Status
  if (report.errors.length > 0)
    report.status = 'INVALID'
  else if (report.warnings.length > 0)
    report.status = 'WARNING'
  else report.status = 'VALID'

  return report
}
