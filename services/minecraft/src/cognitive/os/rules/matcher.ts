/**
 * Matcher - Pure functions for condition matching
 *
 * All functions are pure: (condition, value) => boolean
 */

import type { WhereClause, WhereCondition } from './types'

/**
 * Check if a value matches a single condition
 */
export function matchCondition(
  condition: WhereCondition,
  value: unknown,
): boolean {
  // Direct value comparison (equality)
  if (
    typeof condition === 'string'
    || typeof condition === 'number'
    || typeof condition === 'boolean'
  ) {
    return value === condition
  }

  // Object with operator
  if (typeof condition === 'object' && condition !== null) {
    if ('eq' in condition) {
      return value === condition.eq
    }
    if ('ne' in condition) {
      return value !== condition.ne
    }
    if ('lt' in condition) {
      return typeof value === 'number' && value < condition.lt!
    }
    if ('lte' in condition) {
      return typeof value === 'number' && value <= condition.lte!
    }
    if ('gt' in condition) {
      return typeof value === 'number' && value > condition.gt!
    }
    if ('gte' in condition) {
      return typeof value === 'number' && value >= condition.gte!
    }
    if ('in' in condition) {
      return (condition.in as readonly unknown[]).includes(value)
    }
    if ('contains' in condition) {
      return typeof value === 'string' && value.includes(condition.contains!)
    }
  }

  return false
}

/**
 * Get a nested value from an object using dot notation
 * e.g., getNestedValue({ a: { b: 1 } }, 'a.b') => 1
 */
export function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }
    if (typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

/**
 * Check if an event payload matches a where clause
 */
export function matchWhere(
  whereClause: WhereClause | undefined,
  payload: unknown,
): boolean {
  if (!whereClause) {
    return true
  }

  for (const [path, condition] of Object.entries(whereClause)) {
    const value = getNestedValue(payload, path)
    if (!matchCondition(condition, value)) {
      return false
    }
  }

  return true
}

/**
 * Build event type string from modality and kind
 */
export function buildEventType(modality: string, kind: string): string {
  return `raw:${modality}:${kind}`
}

/**
 * Check if an event type matches a pattern
 * Supports wildcards: 'raw:*' matches 'raw:sighted:punch'
 */
export function matchEventType(pattern: string, eventType: string): boolean {
  if (pattern === '*') {
    return true
  }

  if (pattern.endsWith(':*')) {
    const prefix = pattern.slice(0, -1)
    return eventType.startsWith(prefix)
  }

  return pattern === eventType
}

/**
 * Render a template string with placeholders
 * e.g., 'Player {{ name }} says {{ message }}' + { name: 'Bob', message: 'Hi' }
 *       => 'Player Bob says Hi'
 */
export function renderTemplate(
  template: string,
  context: Readonly<Record<string, unknown>>,
): string {
  return template.replace(/\{\{\s*(\w+(?:\.\w+)*)\s*\}\}/g, (_, path: string) => {
    const value = getNestedValue(context, path)
    return value !== undefined ? String(value) : `{{${path}}}`
  })
}

/**
 * Render metadata object with template values
 */
export function renderMetadata(
  metadata: Readonly<Record<string, string | number | boolean>> | undefined,
  context: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  if (!metadata) {
    return Object.freeze({})
  }

  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === 'string') {
      // Check if it looks like a template
      if (value.includes('{{')) {
        result[key] = renderTemplate(value, context)
      }
      else {
        // Check if the value references a context field directly
        const contextValue = getNestedValue(context, value)
        result[key] = contextValue !== undefined ? contextValue : value
      }
    }
    else {
      result[key] = value
    }
  }

  return Object.freeze(result)
}
