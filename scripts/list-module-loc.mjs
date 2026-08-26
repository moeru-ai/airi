#!/usr/bin/env node
/* eslint-disable no-console */

import fs from 'node:fs'
import path from 'node:path'

import { spawnSync } from 'node:child_process'
import { argv, cwd } from 'node:process'

const ROOT = cwd()
const SEARCH_ROOTS = ['apps', 'packages', 'plugins', 'services', 'integrations', 'docs']
const IGNORE_DIRS = new Set(['.cache', '.git', '.next', '.nuxt', '.turbo', '.vite', 'build', 'coverage', 'dist', 'node_modules', 'out'])

function cleanupExportTarget(raw) {
  if (!raw)
    return ''

  const q = raw.indexOf('?')
  const h = raw.indexOf('#')
  let end = raw.length
  if (q >= 0)
    end = Math.min(end, q)
  if (h >= 0)
    end = Math.min(end, h)

  return raw.slice(0, end).trim()
}

function collectEntryCandidates(pkg) {
  const out = []
  const pushIfString = (source, value) => {
    if (typeof value === 'string' && value.trim())
      out.push({ raw: value.trim(), source })
  }

  pushIfString('main', pkg.main)
  pushIfString('module', pkg.module)
  pushIfString('types', pkg.types)
  pushIfString('typings', pkg.typings)

  if (typeof pkg.bin === 'string') {
    pushIfString('bin', pkg.bin)
  }
  else if (pkg.bin && typeof pkg.bin === 'object') {
    for (const [k, v] of Object.entries(pkg.bin))
      pushIfString(`bin.${k}`, v)
  }

  if (typeof pkg.exports === 'string') {
    pushIfString('exports', pkg.exports)
  }
  else if (pkg.exports && typeof pkg.exports === 'object') {
    for (const [k, v] of Object.entries(pkg.exports))
      collectFromExportsValue(v, out, `exports.${k}`)
  }

  return out
}

function collectFromExportsValue(value, out, source) {
  if (typeof value === 'string') {
    out.push({ raw: value, source })
    return
  }
  if (Array.isArray(value)) {
    for (const item of value)
      collectFromExportsValue(item, out, source)
    return
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value))
      collectFromExportsValue(v, out, `${source}.${k}`)
  }
}

function collectPackageJsonFiles() {
  const files = [path.join(ROOT, 'package.json')]
  for (const base of SEARCH_ROOTS) {
    const full = path.join(ROOT, base)
    if (fs.existsSync(full))
      walk(full, files)
  }
  return files
}

function main() {
  const asJson = argv.includes('--json')
  const pkgJsonFiles = collectPackageJsonFiles()
  const records = []

  for (const pkgFile of pkgJsonFiles) {
    const pkg = safeReadJson(pkgFile)
    if (!pkg)
      continue

    const pkgDir = path.dirname(pkgFile)
    const pkgName = pkg.name || rel(pkgDir)
    const candidates = collectEntryCandidates(pkg)

    for (const candidate of candidates) {
      const resolved = resolveParentDir(pkgDir, candidate.raw)
      if (!resolved)
        continue
      records.push({
        entryClean: resolved.cleaned,
        entryRaw: resolved.raw,
        packageDir: pkgDir,
        packageJson: pkgFile,
        packageName: pkgName,
        parentDir: resolved.parentDir,
        parentDirRel: rel(resolved.parentDir),
        parentExists: resolved.exists,
        source: candidate.source,
      })
    }
  }

  const uniqueByPackageAndDir = new Map()
  for (const rec of records) {
    const key = `${rec.packageName}::${rec.parentDir}`
    const existing = uniqueByPackageAndDir.get(key)
    if (!existing) {
      uniqueByPackageAndDir.set(key, {
        ...rec,
        entries: new Set([rec.entryClean]),
        occurrenceCount: 1,
        sources: new Set([rec.source]),
      })
    }
    else {
      existing.occurrenceCount += 1
      existing.sources.add(rec.source)
      existing.entries.add(rec.entryClean)
    }
  }

  const sccCache = new Map()
  const deduped = Array.from(uniqueByPackageAndDir.values())
  for (const rec of deduped) {
    if (!rec.parentExists) {
      rec.scc = { error: 'directory_not_found', ok: false }
      continue
    }
    if (!sccCache.has(rec.parentDir))
      sccCache.set(rec.parentDir, runScc(rec.parentDir))
    rec.scc = sccCache.get(rec.parentDir)
  }

  const aggregateByParentDir = new Map()
  for (const rec of deduped) {
    const key = rec.parentDir
    const existing = aggregateByParentDir.get(key)
    if (!existing) {
      aggregateByParentDir.set(key, {
        packageCount: 1,
        packageNames: new Set([rec.packageName]),
        parentDir: rec.parentDir,
        parentDirRel: rec.parentDirRel,
        scc: rec.scc,
        totalOccurrenceCount: rec.occurrenceCount,
      })
    }
    else {
      existing.packageCount += 1
      existing.totalOccurrenceCount += rec.occurrenceCount
      existing.packageNames.add(rec.packageName)
    }
  }

  const byPackageRows = deduped
    .sort((a, b) => (b.occurrenceCount - a.occurrenceCount) || a.parentDirRel.localeCompare(b.parentDirRel))
    .map(rec => ({
      code: rec.scc.ok ? rec.scc.code : '',
      files: rec.scc.ok ? rec.scc.files : '',
      occurrences: rec.occurrenceCount,
      package: rec.packageName,
      parent_dir: rec.parentDirRel,
      scc_cmd: toSccCommand(rec.parentDir),
      sources: Array.from(rec.sources).sort().join(','),
      status: rec.scc.ok ? 'ok' : rec.scc.error,
      uloc: rec.scc.ok ? rec.scc.uloc : '',
    }))

  const aggregateRows = Array.from(aggregateByParentDir.values())
    .sort((a, b) => (b.packageCount - a.packageCount) || a.parentDirRel.localeCompare(b.parentDirRel))
    .map(rec => ({
      code: rec.scc.ok ? rec.scc.code : '',
      files: rec.scc.ok ? rec.scc.files : '',
      package_count: rec.packageCount,
      packages: Array.from(rec.packageNames).sort().join(','),
      parent_dir: rec.parentDirRel,
      scc_cmd: toSccCommand(rec.parentDir),
      status: rec.scc.ok ? 'ok' : rec.scc.error,
      total_occurrences: rec.totalOccurrenceCount,
      uloc: rec.scc.ok ? rec.scc.uloc : '',
    }))

  if (asJson) {
    const output = {
      dedupedParentDirsAcrossPackages: aggregateRows,
      generatedAt: new Date().toISOString(),
      packageJsonScanned: pkgJsonFiles.map(rel),
      root: ROOT,
      uniquePackageEntrypointParents: byPackageRows,
    }
    console.log(JSON.stringify(output, null, 2))
    return
  }

  printGroup('Per Package Entrypoint Parent (Deduped)')
  printTable(
    byPackageRows,
    [
      { key: 'package', title: 'package' },
      { key: 'parent_dir', title: 'parent_dir' },
      { key: 'occurrences', title: 'occ' },
      { key: 'code', title: 'code' },
      { key: 'uloc', title: 'uloc' },
      { key: 'files', title: 'files' },
      { key: 'status', title: 'status' },
      { key: 'scc_cmd', title: 'scc_cmd' },
    ],
  )

  printGroup('Parent Dir Aggregation Across Packages (Deduped)')
  printTable(
    aggregateRows,
    [
      { key: 'parent_dir', title: 'parent_dir' },
      { key: 'package_count', title: 'pkgs' },
      { key: 'total_occurrences', title: 'occ_total' },
      { key: 'code', title: 'code' },
      { key: 'uloc', title: 'uloc' },
      { key: 'files', title: 'files' },
      { key: 'status', title: 'status' },
      { key: 'scc_cmd', title: 'scc_cmd' },
    ],
  )
}

function printGroup(title) {
  console.log(`\n=== ${title} ===`)
}

function printTable(rows, columns) {
  const widths = {}
  for (const col of columns)
    widths[col.key] = col.title.length

  for (const row of rows) {
    for (const col of columns) {
      const value = String(row[col.key] ?? '')
      widths[col.key] = Math.max(widths[col.key], value.length)
    }
  }

  const line = row => columns.map(col => String(row[col.key] ?? '').padEnd(widths[col.key])).join('  ')
  console.log(line(Object.fromEntries(columns.map(c => [c.key, c.title]))))
  console.log(columns.map(col => '-'.repeat(widths[col.key])).join('  '))
  for (const row of rows)
    console.log(line(row))
}

function rel(p) {
  const rp = path.relative(ROOT, p)
  return rp || '.'
}

function resolveParentDir(pkgDir, rawTarget) {
  const target = cleanupExportTarget(rawTarget)
  // eslint-disable-next-line regexp/no-unused-capturing-group
  if (!target || /^(https?:|npm:|node:|data:)/.test(target))
    return null

  const wildcardIndex = target.indexOf('*')
  const logicalTarget = wildcardIndex >= 0 ? target.slice(0, wildcardIndex) : target
  const abs = path.resolve(pkgDir, logicalTarget)
  const ext = path.extname(logicalTarget)

  let parentDir = abs
  if (ext)
    parentDir = path.dirname(abs)
  else if (logicalTarget.endsWith('/'))
    parentDir = abs
  else if (fs.existsSync(abs) && fs.statSync(abs).isFile())
    parentDir = path.dirname(abs)

  return {
    cleaned: target,
    exists: fs.existsSync(parentDir) && fs.statSync(parentDir).isDirectory(),
    parentDir,
    raw: rawTarget,
  }
}

function runScc(dir) {
  const proc = spawnSync('scc', ['-a', '-f', 'json', dir], { encoding: 'utf8' })
  if (proc.status !== 0) {
    return {
      error: (proc.stderr || proc.stdout || `exit ${proc.status}`).trim(),
      ok: false,
    }
  }

  let parsed
  try {
    parsed = JSON.parse(proc.stdout)
  }
  catch (err) {
    return {
      error: `invalid scc json: ${String(err)}`,
      ok: false,
    }
  }

  const sum = key => parsed.reduce((acc, row) => acc + Number(row[key] || 0), 0)
  return {
    blanks: sum('Blank'),
    code: sum('Code'),
    comments: sum('Comment'),
    files: sum('Count'),
    lines: sum('Lines'),
    ok: true,
    uloc: sum('ULOC'),
  }
}

function safeReadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  }
  catch {
    return null
  }
}

function toSccCommand(absDir) {
  return `scc -a -f json "${rel(absDir)}"`
}

function walk(dir, out) {
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  }
  catch {
    return
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      if (entry.name !== '.vitepress')
        continue
    }

    const full = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name))
        continue
      walk(full, out)
      continue
    }

    if (entry.isFile() && entry.name === 'package.json')
      out.push(full)
  }
}

main()
