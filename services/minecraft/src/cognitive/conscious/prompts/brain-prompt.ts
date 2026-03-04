import type { Action } from '../../../libs/mineflayer/action'

import fs, { readFileSync } from 'node:fs'

import { fileURLToPath } from 'node:url'

const templatePath = fileURLToPath(new URL('./brain-prompt.md', import.meta.url))

let cachedTemplate: string | null = null
let watcherInitialized = false

function loadTemplateFromDisk(): string {
  return readFileSync(templatePath, 'utf-8')
}

function ensureTemplateLoaded(): string {
  if (cachedTemplate == null)
    cachedTemplate = loadTemplateFromDisk()
  return cachedTemplate
}

function ensureWatcher(): void {
  if (watcherInitialized)
    return

  watcherInitialized = true
  if (process.env.NODE_ENV === 'production')
    return

  fs.watch(templatePath, { persistent: false }, () => {
    try {
      cachedTemplate = loadTemplateFromDisk()
    }
    catch {
      cachedTemplate = null
    }
  })
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_full, key) => vars[key] ?? '')
}

// Helper to extract readable type from Zod schema
function getZodTypeName(def: any): string {
  if (!def)
    return 'any'
  const type = def.type || def.typeName

  if (type === 'string' || type === 'ZodString')
    return 'string'
  if (type === 'number' || type === 'ZodNumber')
    return 'number'
  if (type === 'boolean' || type === 'ZodBoolean')
    return 'boolean'

  if (type === 'array' || type === 'ZodArray') {
    const innerDef = def.element?._def || def.type?._def
    return `array<${getZodTypeName(innerDef)}>`
  }

  if (type === 'enum' || type === 'ZodEnum') {
    const values = def.values || (def.entries ? Object.keys(def.entries) : [])
    return `enum(${values.join('|')})`
  }

  if (type === 'optional' || type === 'ZodOptional') {
    return `${getZodTypeName(def.innerType?._def)} (optional)`
  }

  if (type === 'default' || type === 'ZodDefault') {
    return getZodTypeName(def.innerType?._def)
  }

  if (type === 'effects' || type === 'ZodEffects') {
    return getZodTypeName(def.schema?._def)
  }

  return type || 'any'
}

function getZodConstraintHint(def: any): string {
  if (!def)
    return ''

  const checks = Array.isArray(def.checks) ? def.checks : []
  const hints: string[] = []

  for (const check of checks) {
    if (check?.kind === 'min' && typeof check.value === 'number') {
      hints.push(`min=${check.value}`)
    }
    if (check?.kind === 'max' && typeof check.value === 'number') {
      hints.push(`max=${check.value}`)
    }
    if (check?.def?.check === 'greater_than' && typeof check.def.value === 'number') {
      hints.push(`min=${check.def.inclusive ? check.def.value : check.def.value + 1}`)
    }
    if (check?.def?.check === 'less_than' && typeof check.def.value === 'number') {
      hints.push(`max=${check.def.inclusive ? check.def.value : check.def.value - 1}`)
    }
  }

  return hints.length > 0 ? ` (${hints.join(', ')})` : ''
}

function abbreviateToolDescription(input: string): string {
  return input
    .replace(/\bAutomatically\b/gi, 'Auto')
    .replace(/\bapproximately\b/gi, 'approx')
    .replace(/\bcoordinate(s)?\b/gi, 'coord$1')
    .replace(/\bcoordinates\b/gi, 'coords')
    .replace(/\binventory\b/gi, 'inv')
    .replace(/\bnearest\b/gi, 'near')
    .replace(/\bspecific\b/gi, 'spec')
    .replace(/\bgiven\b/gi, '')
    .replace(/\bnumber of\b/gi, '#')
    .replace(/\bplayer\b/gi, 'plyr')
    .replace(/\bplayers\b/gi, 'plyrs')
    .replace(/\bresource(s)?\b/gi, 'res$1')
    .replace(/\bposition\b/gi, 'pos')
    .replace(/\bwhether\b/gi, 'if')
    .replace(/\s+/g, ' ')
    .trim()
}

export function generateBrainSystemPrompt(availableActions: Action[]): string {
  const toolsFormatted = availableActions.map((a) => {
    const paramKeys = Object.keys(a.schema.shape)
    const positionalSignature = paramKeys.length > 0 ? `${a.name}(${paramKeys.join(', ')})` : `${a.name}()`
    const objectSignature = paramKeys.length > 0 ? `${a.name}({ ${paramKeys.join(', ')} })` : `${a.name}()`

    const params = a.schema && 'shape' in a.schema
      ? Object.entries(a.schema.shape).map(([key, val]: [string, any]) => {
          const def = val._def
          const type = getZodTypeName(def)
          const constraints = getZodConstraintHint(def).replace(/^\s+/, '')
          const desc = val.description ? ` ${String(val.description).trim()}` : ''
          return `${key}:${type}${constraints}${desc}`
        }).join('; ')
      : ''

    const compactDescription = abbreviateToolDescription(a.description)
    return `${a.name}|${compactDescription}|sig:${positionalSignature}|obj:${objectSignature}${params ? `|args:${params}` : ''}`
  }).join('\n')

  ensureWatcher()
  const template = ensureTemplateLoaded()
  return renderTemplate(template, {
    toolsFormatted,
  })
}
