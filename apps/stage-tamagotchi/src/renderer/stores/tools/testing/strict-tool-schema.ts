import type { Tool } from '@xsai/shared-chat'
import type { JsonSchema } from 'xsschema'

import { expect } from 'vitest'

interface StrictToolSchemaIssue {
  path: string
  message: string
}

declare module 'vitest' {
  interface Assertion<T = any> {
    toSatisfyStrictToolSchema: () => T
    toSatisfyStrictToolSchemas: () => T
  }
  interface AsymmetricMatchersContaining {
    toSatisfyStrictToolSchema: () => void
    toSatisfyStrictToolSchemas: () => void
  }
}

function isSchemaRecord(value: unknown): value is JsonSchema {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function sorted(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right))
}

function collectSchemaIssues(schema: unknown, path: string, issues: StrictToolSchemaIssue[]): void {
  if (!isSchemaRecord(schema)) {
    return
  }

  if (schema.properties) {
    const propertyKeys = Object.keys(schema.properties)
    const required = Array.isArray(schema.required) ? schema.required.filter((value): value is string => typeof value === 'string') : []

    if (!Array.isArray(schema.required)) {
      issues.push({
        path,
        message: '`required` must be supplied when `properties` is present.',
      })
    }
    else if (sorted(required).join('\0') !== sorted(propertyKeys).join('\0')) {
      const missing = propertyKeys.filter(key => !required.includes(key))
      const extra = required.filter(key => !propertyKeys.includes(key))
      issues.push({
        path,
        message: [
          '`required` must include every key in `properties`.',
          missing.length ? `Missing: ${missing.join(', ')}.` : '',
          extra.length ? `Extra: ${extra.join(', ')}.` : '',
        ].filter(Boolean).join(' '),
      })
    }

    if (schema.additionalProperties !== false) {
      issues.push({
        path,
        message: '`additionalProperties` must be false when `properties` is present.',
      })
    }

    for (const [key, value] of Object.entries(schema.properties)) {
      collectSchemaIssues(value, `${path}.${key}`, issues)
    }
  }

  if (Array.isArray(schema.items)) {
    schema.items.forEach((item, index) => collectSchemaIssues(item, `${path}.items[${index}]`, issues))
  }
  else if (schema.items) {
    collectSchemaIssues(schema.items, `${path}.items`, issues)
  }

  for (const unionKey of ['anyOf', 'oneOf', 'allOf'] as const) {
    const schemas = schema[unionKey]
    if (Array.isArray(schemas)) {
      schemas.forEach((item, index) => collectSchemaIssues(item, `${path}.${unionKey}[${index}]`, issues))
    }
  }
}

/**
 * Collects strict provider schema issues from one xsAI tool.
 *
 * Use when:
 * - Vitest checks need diagnostics instead of throwing immediately
 * - A provider rejects schemas that omit `required` keys or allow extra object properties
 *
 * Expects:
 * - `tool.function.parameters` contains the provider-facing JSON Schema
 *
 * Returns:
 * - A list of path-qualified issues; empty means the schema satisfies the local strict rules
 */
export function collectStrictToolSchemaIssues(tool: Tool): StrictToolSchemaIssue[] {
  const issues: StrictToolSchemaIssue[] = []
  collectSchemaIssues(tool.function.parameters, `${tool.function.name}.parameters`, issues)
  return issues
}

function formatIssues(issues: StrictToolSchemaIssue[]): string {
  return issues.map(issue => `- ${issue.path}: ${issue.message}`).join('\n')
}

/**
 * Installs Vitest matchers for strict provider-facing tool schema checks.
 *
 * Use when:
 * - A test file wants `expect(tool).toSatisfyStrictToolSchema()`
 * - A test file wants `expect(tools).toSatisfyStrictToolSchemas()`
 *
 * Expects:
 * - Called before the matcher is used in the current Vitest worker
 *
 * Returns:
 * - Registers matchers on Vitest's `expect` object
 */
export function installStrictToolSchemaMatchers(): void {
  expect.extend({
    toSatisfyStrictToolSchema(received: Tool) {
      const issues = collectStrictToolSchemaIssues(received)

      return {
        pass: issues.length === 0,
        message: () => issues.length
          ? `Expected tool schema to satisfy strict provider rules:\n${formatIssues(issues)}`
          : 'Expected tool schema not to satisfy strict provider rules.',
      }
    },
    toSatisfyStrictToolSchemas(received: Tool[]) {
      const issues = received.flatMap(tool => collectStrictToolSchemaIssues(tool))

      return {
        pass: issues.length === 0,
        message: () => issues.length
          ? `Expected tool schemas to satisfy strict provider rules:\n${formatIssues(issues)}`
          : 'Expected tool schemas not to satisfy strict provider rules.',
      }
    },
  })
}
