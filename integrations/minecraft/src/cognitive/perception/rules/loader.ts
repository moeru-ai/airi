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

import { buildEventType } from './matcher'
import { parseWindowDuration } from './temporal-detector'
import { yamlRuleSchema } from './types'

/**
 * Load and parse a single YAML rule file
 */
export function loadRuleFile(filePath: string): ParsedRule {
  const content = fs.readFileSync(filePath, 'utf-8')
  const yaml = parseYaml(content)

  return parseRule(yaml, filePath)
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
 * Parse a YAML rule object into internal representation
 */
export function parseRule(yaml: unknown, sourcePath: string): ParsedRule {
  const parsedYaml = yamlRuleSchema.safeParse(yaml)
  if (!parsedYaml.success) {
    throw formatValidationError(parsedYaml.error, sourcePath)
  }

  const validatedRule = parsedYaml.data
  const windowMs = parseWindowDuration(validatedRule.detector.window)

  return Object.freeze({
    detector: Object.freeze({
      groupBy: validatedRule.detector.groupBy,
      mode: validatedRule.detector.mode ?? 'sliding',
      threshold: validatedRule.detector.threshold,
      windowMs,
    }),
    name: validatedRule.name,
    signal: Object.freeze({
      confidence: validatedRule.signal.confidence ?? 1.0,
      description: validatedRule.signal.description,
      metadata: validatedRule.signal.metadata ? Object.freeze(validatedRule.signal.metadata) : undefined,
      type: validatedRule.signal.type,
    }),
    sourcePath,
    trigger: Object.freeze({
      eventType: buildEventType(validatedRule.trigger.modality, validatedRule.trigger.kind),
      where: validatedRule.trigger.where ? Object.freeze(validatedRule.trigger.where) : undefined,
    }),
    version: validatedRule.version ?? 1,
  })
}

/**
 * Parse a YAML rule from string content
 * Useful for testing
 */
export function parseRuleFromString(content: string, sourcePath: string = '<string>'): ParsedRule {
  const yaml = parseYaml(content)
  return parseRule(yaml, sourcePath)
}

function formatValidationError(error: ZodError, sourcePath: string): Error {
  const details = error.issues
    .map((issue) => {
      const pathLabel = issue.path.length > 0 ? issue.path.join('.') : '<root>'
      return `- ${pathLabel}: ${issue.message}`
    })
    .join('\n')

  return new Error(`Invalid rule in ${sourcePath}:\n${details}`)
}
