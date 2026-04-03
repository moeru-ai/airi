#!/usr/bin/env node
/* eslint-disable no-console */

import fs from 'node:fs'
import path from 'node:path'

import { spawnSync } from 'node:child_process'
import { argv, cwd } from 'node:process'

const ROOT = cwd()
const SEARCH_ROOTS = ['apps', 'packages', 'plugins', 'services', 'integrations', 'docs']
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.turbo', 'coverage', '.cache', 'out', '.vite'])
const NON_FILESYSTEM_EXPORT_TARGET_PATTERN = /^(?:https?:|npm:|node:|data:)/

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

function collectPackageJsonFiles() {
  const files = [path.join(ROOT, 'package.json')]
  for (const base of SEARCH_ROOTS) {
    const full = path.join(ROOT, base)
    if (fs.existsSync(full))
      walk(full, files)
  }
  return files
}

function safeReadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  }
  catch {
    return null
  }
}

function collectFromExportsValue(value, out, source) {
  if (typeof value === 'string') {
    out.push({ source, raw: value })
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

function collectEntryCandidates(pkg) {
  const out = []
  const pushIfString = (source, value) => {
    if (typeof value === 'string' && value.trim())
      out.push({ source, raw: value.trim() })
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

function resolveParentDir(pkgDir, rawTarget) {
  const target = cleanupExportTarget(rawTarget)

  if (!target || NON_FILESYSTEM_EXPORT_TARGET_PATTERN.test(target))
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
    raw: rawTarget,
    cleaned: target,
    parentDir,
    exists: fs.existsSync(parentDir) && fs.statSync(parentDir).isDirectory(),
  }
}

function runScc(dir) {
  const proc = spawnSync('scc', ['-a', '-f', 'json', dir], { encoding: 'utf8' })
  if (proc.status !== 0) {
    return {
      ok: false,
      error: (proc.stderr || proc.stdout || `exit ${proc.status}`).trim(),
    }
  }

  let parsed
  try {
    parsed = JSON.parse(proc.stdout)
  }
  catch (err) {
    return {
      ok: false,
      error: `invalid scc json: ${String(err)}`,
    }
  }

  const sum = key => parsed.reduce((acc, row) => acc + Number(row[key] || 0), 0)
  return {
    ok: true,
    files: sum('Count'),
    lines: sum('Lines'),
    code: sum('Code'),
    comments: sum('Comment'),
    blanks: sum('Blank'),
    uloc: sum('ULOC'),
  }
}

function rel(p) {
  const rp = path.relative(ROOT, p)
  return rp || '.'
}

function toSccCommand(absDir) {
  return `scc -a -f json "${rel(absDir)}"`
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
        packageName: pkgName,
        packageDir: pkgDir,
        packageJson: pkgFile,
        source: candidate.source,
        entryRaw: resolved.raw,
        entryClean: resolved.cleaned,
        parentDir: resolved.parentDir,
        parentDirRel: rel(resolved.parentDir),
        parentExists: resolved.exists,
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
        occurrenceCount: 1,
        sources: new Set([rec.source]),
        entries: new Set([rec.entryClean]),
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
      rec.scc = { ok: false, error: 'directory_not_found' }
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
        parentDir: rec.parentDir,
        parentDirRel: rec.parentDirRel,
        packageCount: 1,
        packageNames: new Set([rec.packageName]),
        totalOccurrenceCount: rec.occurrenceCount,
        scc: rec.scc,
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
      package: rec.packageName,
      parent_dir: rec.parentDirRel,
      occurrences: rec.occurrenceCount,
      sources: Array.from(rec.sources).sort().join(','),
      code: rec.scc.ok ? rec.scc.code : '',
      uloc: rec.scc.ok ? rec.scc.uloc : '',
      files: rec.scc.ok ? rec.scc.files : '',
      status: rec.scc.ok ? 'ok' : rec.scc.error,
      scc_cmd: toSccCommand(rec.parentDir),
    }))

  const aggregateRows = Array.from(aggregateByParentDir.values())
    .sort((a, b) => (b.packageCount - a.packageCount) || a.parentDirRel.localeCompare(b.parentDirRel))
    .map(rec => ({
      parent_dir: rec.parentDirRel,
      package_count: rec.packageCount,
      packages: Array.from(rec.packageNames).sort().join(','),
      total_occurrences: rec.totalOccurrenceCount,
      code: rec.scc.ok ? rec.scc.code : '',
      uloc: rec.scc.ok ? rec.scc.uloc : '',
      files: rec.scc.ok ? rec.scc.files : '',
      status: rec.scc.ok ? 'ok' : rec.scc.error,
      scc_cmd: toSccCommand(rec.parentDir),
    }))

  if (asJson) {
    const output = {
      generatedAt: new Date().toISOString(),
      root: ROOT,
      packageJsonScanned: pkgJsonFiles.map(rel),
      uniquePackageEntrypointParents: byPackageRows,
      dedupedParentDirsAcrossPackages: aggregateRows,
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

main()
