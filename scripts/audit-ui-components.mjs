#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { stdout } from 'node:process'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

/**
 * Reports rendered component imports, story coverage, and native control locations.
 *
 * Call stack:
 * audit-ui-components
 *   -> readModule
 *   -> resolveImport
 *   -> resolveExport
 *   -> stdout.write
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(root, 'packages/stage-ui/package.json'))
const { parse } = require('vue/compiler-sfc')

const files = execFileSync('rg', ['--files', 'apps', 'packages'], { cwd: root, encoding: 'utf8' }).trim().split('\n').sort()
const packages = new Map(files.filter(file => file.endsWith('/package.json')).map((file) => {
  const manifest = JSON.parse(readFileSync(join(root, file), 'utf8'))
  return [manifest.name, { directory: dirname(file), exports: manifest.exports }]
}))
const modules = new Map()

function readModule(file) {
  if (modules.has(file))
    return modules.get(file)
  const source = readFileSync(join(root, file), 'utf8')
  let script = source
  let template = ''
  let templateLine = 0
  if (file.endsWith('.vue')) {
    const { descriptor, errors } = parse(source, { filename: file })
    if (errors.length)
      throw new Error(`Cannot parse ${file}: ${errors.join(', ')}`)
    script = [descriptor.script?.content, descriptor.scriptSetup?.content].filter(Boolean).join('\n')
    template = (descriptor.template?.content ?? '').replace(/<!--[\s\S]*?-->/g, comment => comment.replace(/[^\n]/g, ' '))
    templateLine = descriptor.template?.loc.start.line ?? 0
  }
  const ast = ts.createSourceFile(file, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const result = { ast, template, templateLine }
  modules.set(file, result)
  return result
}

function resolveImport(file, specifier) {
  let target
  if (specifier.startsWith('.')) {
    target = join(dirname(file), specifier)
  }
  else {
    const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
    const pkg = packages.get(name)
    if (!pkg || !pkg.exports)
      return undefined
    const subpath = specifier === name ? '.' : `.${specifier.slice(name.length)}`
    let entry = pkg.exports[subpath]
    if (!entry) {
      for (const [pattern, value] of Object.entries(pkg.exports)) {
        if (!pattern.includes('*') || typeof value !== 'string')
          continue
        const [prefix, suffix] = pattern.split('*')
        if (subpath.startsWith(prefix) && subpath.endsWith(suffix)) {
          entry = value.replace('*', subpath.slice(prefix.length, suffix ? -suffix.length : undefined))
          break
        }
      }
    }
    if (typeof entry !== 'string')
      return undefined
    target = join(pkg.directory, entry)
  }
  return [target, `${target}.ts`, `${target}.vue`, join(target, 'index.ts')].find(candidate => existsSync(join(root, candidate)) && /\.(?:ts|vue)$/.test(candidate))
}

function resolveExport(file, name, visited = new Set()) {
  const key = `${file}:${name}`
  if (visited.has(key))
    return undefined
  visited.add(key)
  if (file.endsWith('.vue'))
    return file
  for (const node of readModule(file).ast.statements) {
    if (!ts.isExportDeclaration(node) || node.isTypeOnly || !node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier))
      continue
    const target = resolveImport(file, node.moduleSpecifier.text)
    if (!target)
      continue
    if (!node.exportClause) {
      const found = resolveExport(target, name, visited)
      if (found)
        return found
    }
    else if (ts.isNamedExports(node.exportClause)) {
      const item = node.exportClause.elements.find(item => !item.isTypeOnly && item.name.text === name)
      if (item)
        return resolveExport(target, item.propertyName?.text ?? item.name.text, visited)
    }
  }
  return undefined
}

function imports(file) {
  const result = []
  for (const node of readModule(file).ast.statements) {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier) || node.importClause?.isTypeOnly)
      continue
    const source = node.moduleSpecifier.text
    const target = resolveImport(file, source)
    const clause = node.importClause
    const bindings = []
    if (clause?.name)
      bindings.push({ local: clause.name.text, exported: 'default' })
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const item of clause.namedBindings.elements) {
        if (!item.isTypeOnly)
          bindings.push({ local: item.name.text, exported: item.propertyName?.text ?? item.name.text })
      }
    }
    for (const binding of bindings)
      result.push({ ...binding, source, component: target ? resolveExport(target, binding.exported) : undefined })
  }
  return result
}

function renderedImports(file) {
  const { template } = readModule(file)
  return imports(file).filter((item) => {
    const kebab = item.local.replace(/[A-Z]/g, (letter, index) => `${index ? '-' : ''}${letter.toLowerCase()}`)
    return new RegExp(`<(${item.local}|${kebab})(?:\\s|/|>)`).test(template)
  })
}

const vueFiles = files.filter(file => file.endsWith('.vue') && !file.includes('/public/') && !file.includes('/dist/'))
const stories = vueFiles.filter(file => file.startsWith('packages/stage-ui/') && file.endsWith('.story.vue'))
const coverage = new Map()
for (const story of stories) {
  for (const item of renderedImports(story)) {
    if (item.component) {
      if (!coverage.has(item.component))
        coverage.set(item.component, [])
      coverage.get(item.component).push(story)
    }
  }
}
const components = vueFiles.filter(file => !file.endsWith('.story.vue') && !file.includes('/stories/')).map((file) => {
  const { template, templateLine } = readModule(file)
  const dependencies = renderedImports(file)
  const rawControls = [...template.matchAll(/<(button|input|textarea|select)\b/g)].map(match => ({
    tag: match[1],
    line: templateLine + template.slice(0, match.index).split('\n').length - 1,
  }))
  return {
    file,
    stories: coverage.get(file) ?? [],
    sharedImports: dependencies.filter(item => item.source.startsWith('@proj-airi/ui') || item.source.startsWith('@proj-airi/stage-ui')).map(item => `${item.source}:${item.local}`),
    localComponents: dependencies.filter(item => item.component && !item.source.startsWith('@proj-airi/ui') && !item.source.startsWith('@proj-airi/stage-ui')).map(item => item.component),
    unresolvedVueImports: dependencies.filter(item => !item.component && item.source.endsWith('.vue')).map(item => item.source),
    rawControls,
  }
})
const byFile = new Map(components.map(component => [component.file, component]))
function composedCoverage(file, story, visited = new Set()) {
  if (visited.has(file))
    return
  visited.add(file)
  const component = byFile.get(file)
  if (!component)
    return
  component.composedStories ??= []
  if (!component.stories.includes(story) && !component.composedStories.includes(story))
    component.composedStories.push(story)
  for (const item of renderedImports(file)) {
    if (item.component)
      composedCoverage(item.component, story, visited)
  }
}
for (const [file, directStories] of coverage) {
  for (const story of directStories)
    composedCoverage(file, story)
}
// Direct story references are evidence of rendering, not visual or interaction acceptance.
stdout.write(`${JSON.stringify({ scope: 'Vue SFCs in apps and packages. Static template tags in stage-ui Histoire stories. Composed references follow rendered imports.', storyCount: stories.length, components }, null, 2)}\n`)
