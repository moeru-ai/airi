/**
 * YAML Rule Loader
 *
 * Loads and parses YAML rule files from a directory
 */

import type { ParsedRule, YamlRule } from './types'

import * as fs from 'node:fs'
import * as path from 'node:path'

import { parse as parseYaml } from 'yaml'

import { parseWindowDuration } from './accumulator'
import { buildEventType } from './matcher'

/**
 * Load and parse a single YAML rule file
 */
export function loadRuleFile(filePath: string): ParsedRule {
  const content = fs.readFileSync(filePath, 'utf-8')
  const yaml = parseYaml(content) as YamlRule

  return parseRule(yaml, filePath)
}

/**
 * Parse a YAML rule object into internal representation
 */
export function parseRule(yaml: YamlRule, sourcePath: string): ParsedRule {
  // Validate required fields
  if (!yaml.name) {
    throw new Error(`Rule missing 'name' in ${sourcePath}`)
  }
  if (!yaml.trigger) {
    throw new Error(`Rule '${yaml.name}' missing 'trigger' in ${sourcePath}`)
  }
  if (!yaml.trigger.modality || !yaml.trigger.kind) {
    throw new Error(`Rule '${yaml.name}' trigger missing 'modality' or 'kind' in ${sourcePath}`)
  }
  if (!yaml.accumulator) {
    throw new Error(`Rule '${yaml.name}' missing 'accumulator' in ${sourcePath}`)
  }
  if (!yaml.signal) {
    throw new Error(`Rule '${yaml.name}' missing 'signal' in ${sourcePath}`)
  }

  const windowMs = parseWindowDuration(yaml.accumulator.window)

  return Object.freeze({
    name: yaml.name,
    version: yaml.version ?? 1,
    trigger: Object.freeze({
      eventType: buildEventType(yaml.trigger.modality, yaml.trigger.kind),
      where: yaml.trigger.where ? Object.freeze(yaml.trigger.where) : undefined,
    }),
    accumulator: Object.freeze({
      threshold: yaml.accumulator.threshold,
      windowMs,
      mode: yaml.accumulator.mode ?? 'sliding',
    }),
    signal: Object.freeze({
      type: yaml.signal.type,
      description: yaml.signal.description,
      confidence: yaml.signal.confidence ?? 1.0,
      metadata: yaml.signal.metadata ? Object.freeze(yaml.signal.metadata) : undefined,
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
  const yaml = parseYaml(content) as YamlRule
  return parseRule(yaml, sourcePath)
}
