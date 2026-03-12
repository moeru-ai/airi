import { describe, expect, it } from 'vitest'

import {
  hasInteractiveOutputMarkers,
  INTERACTIVE_OUTPUT_MARKERS,
  isKnownInteractiveCommand,
  KNOWN_INTERACTIVE_COMMAND_PATTERNS,
} from './interactive-patterns'

describe('interactive-patterns', () => {
  describe('known interactive command patterns', () => {
    it('has exactly 5 regex entries', () => {
      expect(KNOWN_INTERACTIVE_COMMAND_PATTERNS).toHaveLength(5)
    })
  })

  describe('isKnownInteractiveCommand', () => {
    // TUI / full-screen commands
    it.each([
      'vim',
      'nvim',
      'nano',
      'less',
      'more',
      'man',
      'top',
      'htop',
      'watch',
      'tmux',
      'screen',
    ])('matches TUI command: %s', (cmd) => {
      expect(isKnownInteractiveCommand(cmd)).toBe(true)
    })

    it('matches TUI command with arguments', () => {
      expect(isKnownInteractiveCommand('vim src/index.ts')).toBe(true)
      expect(isKnownInteractiveCommand('less /tmp/log.txt')).toBe(true)
    })

    // REPL commands
    it.each([
      'node',
      'node -i',
      'python',
      'python3',
      'python -i',
      'python3 -i',
      'irb',
      'rails console',
      'psql',
      'mysql',
      'sqlite3',
    ])('matches REPL: %s', (cmd) => {
      expect(isKnownInteractiveCommand(cmd)).toBe(true)
    })

    // Init wizards
    it.each([
      'npm create',
      'npm init',
      'pnpm create',
      'pnpm init',
      'yarn create',
      'yarn init',
    ])('matches init wizard: %s', (cmd) => {
      expect(isKnownInteractiveCommand(cmd)).toBe(true)
    })

    // NON-matching commands
    it.each([
      'ls',
      'echo hello',
      'node script.js',
      'python3 app.py',
      'npm install',
      'pnpm run build',
      'git status',
    ])('does not match non-interactive: %s', (cmd) => {
      expect(isKnownInteractiveCommand(cmd)).toBe(false)
    })

    it('trims whitespace', () => {
      expect(isKnownInteractiveCommand('  vim  ')).toBe(true)
    })
  })

  describe('interactive output markers', () => {
    it('has exactly 7 markers', () => {
      expect(INTERACTIVE_OUTPUT_MARKERS).toHaveLength(7)
    })
  })

  describe('hasInteractiveOutputMarkers', () => {
    it.each([
      'READY>',
      'Password:',
      'Press any key',
      'Select an option',
      'Enter your choice',
      '[y/N]',
      '[Y/n]',
    ])('detects marker: %s', (marker) => {
      expect(hasInteractiveOutputMarkers(`Some output... ${marker} more text`)).toBe(true)
    })

    it('is case-insensitive', () => {
      expect(hasInteractiveOutputMarkers('please enter PASSWORD:')).toBe(true)
      expect(hasInteractiveOutputMarkers('ready>')).toBe(true)
    })

    it('returns false for normal output', () => {
      expect(hasInteractiveOutputMarkers('Build succeeded in 4.2s')).toBe(false)
      expect(hasInteractiveOutputMarkers('All tests passed')).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(hasInteractiveOutputMarkers('')).toBe(false)
    })
  })
})
