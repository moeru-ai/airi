/**
 * YAML Rule Loader
 *
 * Loads and parses YAML rule files from a directory
 */

import type { ZodError } from 'zod'

import type { ParsedRule } from './types'

import * as fs from 'node:fs'
import * as path from 'node:path'

import { parse as parseYaml } from 'yaml'

import { parseWindowDuration } from './accumulator'
import { buildEventType } from './matcher'
import { yamlRuleSchema } from './types'

function formatValidationError(error: ZodError, sourcePath: string): Error {
  const details = error.issues
    .map((issue) => {
      const pathLabel = issue.path.length > 0 ? issue.path.join('.') : '<root>'
      return `- ${pathLabel}: ${issue.message}`
    })
    .join('\n')

  return new Error(`Invalid rule in ${sourcePath}:\n${details}`)
}

/**
 * Load and parse a single YAML rule file
 */
export function loadRuleFile(filePath: string): ParsedRule {
  const content = fs.readFileSync(filePath, 'utf-8')
  const yaml = parseYaml(content)

  return parseRule(yaml, filePath)
}

/**
 * Parse a YAML rule object into internal representation
 */
export function parseRule(yaml: unknown, sourcePath: string): ParsedRule {
  const parsedYaml = yamlRuleSchema.safeParse(yaml)
  if (!parsedYaml.success) {
    throw formatValidationError(parsedYaml.error, sourcePath)
  }

  const validatedRule = parsedYaml.data
  const windowMs = parseWindowDuration(validatedRule.accumulator.window)

  return Object.freeze({
    name: validatedRule.name,
    version: validatedRule.version ?? 1,
    trigger: Object.freeze({
      eventType: buildEventType(validatedRule.trigger.modality, validatedRule.trigger.kind),
      where: validatedRule.trigger.where ? Object.freeze(validatedRule.trigger.where) : undefined,
    }),
    accumulator: Object.freeze({
      threshold: validatedRule.accumulator.threshold,
      windowMs,
      mode: validatedRule.accumulator.mode ?? 'sliding',
    }),
    signal: Object.freeze({
      type: validatedRule.signal.type,
      description: validatedRule.signal.description,
      confidence: validatedRule.signal.confidence ?? 1.0,
      metadata: validatedRule.signal.metadata ? Object.freeze(validatedRule.signal.metadata) : undefined,
    }),
    sourcePath,
  })
}

/**
 * Load all YAML rules from a directory (recursively)
 */
export function loadRulesFromDirectory(dirPath: string): ParsedRule[] {
  const rules: ParsedRule[] = []

  if (!fs.existsSync(dirPath)) {
    return rules
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      // Recurse into subdirectories
      rules.push(...loadRulesFromDirectory(fullPath))
    }
    else if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
      try {
        rules.push(loadRuleFile(fullPath))
      }
      catch (err) {
        console.error(`Failed to load rule from ${fullPath}:`, err)
      }
    }
  }

  return rules
}

/**
 * Parse a YAML rule from string content
 * Useful for testing
 */
export function parseRuleFromString(content: string, sourcePath: string = '<string>'): ParsedRule {
  const yaml = parseYaml(content)
  return parseRule(yaml, sourcePath)
}
