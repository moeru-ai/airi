import type { Action } from '../../../libs/mineflayer/action'

import fs, { readFileSync } from 'node:fs'

import { env } from 'node:process'
import { fileURLToPath } from 'node:url'

const templatePath = fileURLToPath(new URL('./brain-prompt.md', import.meta.url))
const TEMPLATE_PLACEHOLDER_RE = /\{\{\s*(\w+)\s*\}\}/g
const AUTO_WORD_RE = /\bAutomatically\b/gi
const APPROXIMATELY_WORD_RE = /\bapproximately\b/gi
const COORDINATE_WORD_RE = /\bcoordinate(s)?\b/gi
const COORDINATES_WORD_RE = /\bcoordinates\b/gi
const INVENTORY_WORD_RE = /\binventory\b/gi
const NEAREST_WORD_RE = /\bnearest\b/gi
const SPECIFIC_WORD_RE = /\bspecific\b/gi
const GIVEN_WORD_RE = /\bgiven\b/gi
const NUMBER_OF_WORD_RE = /\bnumber of\b/gi
const PLAYER_WORD_RE = /\bplayer\b/gi
const PLAYERS_WORD_RE = /\bplayers\b/gi
const RESOURCE_WORD_RE = /\bresource(s)?\b/gi
const POSITION_WORD_RE = /\bposition\b/gi
const WHETHER_WORD_RE = /\bwhether\b/gi
const WHITESPACE_RE = /\s+/g
const LEADING_WHITESPACE_RE = /^\s+/

let cachedTemplate: string | null = null
let watcherInitialized = false

function loadTemplateFromDisk(): string {
  return readFileSync(templatePath, 'utf-8')
}

function ensureTemplateLoaded(): string {
  cachedTemplate ??= loadTemplateFromDisk()
  return cachedTemplate
}

function ensureWatcher(): void {
  if (watcherInitialized)
    return

  watcherInitialized = true
  if (env.NODE_ENV === 'production')
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
  return template.replace(TEMPLATE_PLACEHOLDER_RE, (_full, key) => vars[key] ?? '')
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
    .replace(AUTO_WORD_RE, 'Auto')
    .replace(APPROXIMATELY_WORD_RE, 'approx')
    .replace(COORDINATE_WORD_RE, 'coord$1')
    .replace(COORDINATES_WORD_RE, 'coords')
    .replace(INVENTORY_WORD_RE, 'inv')
    .replace(NEAREST_WORD_RE, 'near')
    .replace(SPECIFIC_WORD_RE, 'spec')
    .replace(GIVEN_WORD_RE, '')
    .replace(NUMBER_OF_WORD_RE, '#')
    .replace(PLAYER_WORD_RE, 'plyr')
    .replace(PLAYERS_WORD_RE, 'plyrs')
    .replace(RESOURCE_WORD_RE, 'res$1')
    .replace(POSITION_WORD_RE, 'pos')
    .replace(WHETHER_WORD_RE, 'if')
    .replace(WHITESPACE_RE, ' ')
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
          const constraints = getZodConstraintHint(def).replace(LEADING_WHITESPACE_RE, '')
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
