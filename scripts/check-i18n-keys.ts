#!/usr/bin/env tsx
/**
 * Korean translation key completeness check script
 * TDD workflow automation tool
 */

import process from 'node:process'

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Simple YAML parser (basic structure only)
function parseYaml(content: string): any {
  try {
    // Very basic YAML parsing - recommend using actual yaml library in production
    const lines = content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'))
    const result: any = {}
    const stack: any[] = [{ obj: result, indent: 0 }]

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed)
        continue

      const indent = line.length - line.trimStart().length
      const [key, ...valueParts] = trimmed.split(':')
      const value = valueParts.join(':').trim()

      // Adjust stack to match indent level
      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
        stack.pop()
      }

      const current = stack[stack.length - 1].obj

      if (value) {
        // Case with value
        let cleanValue = value
        if (value.startsWith('"') && value.endsWith('"')) {
          cleanValue = value.slice(1, -1)
        }
        else if (value.startsWith('\'') && value.endsWith('\'')) {
          cleanValue = value.slice(1, -1)
        }
        else if (value === '>') {
          cleanValue = '' // Treat multiline strings as empty string
        }
        current[key.trim()] = cleanValue
      }
      else {
        // Case without value (nested object)
        current[key.trim()] = {}
        stack.push({ obj: current[key.trim()], indent })
      }
    }

    return result
  }
  catch (error) {
    console.error('YAML Parsing Error:', error)
    return {}
  }
}

interface TranslationStats {
  file: string
  totalKeys: number
  translatedKeys: number
  missingKeys: string[]
  completionRate: number
}

// Recursively extract all keys from object
function extractKeys(obj: any, prefix: string = ''): string[] {
  const keys: string[] = []

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...extractKeys(value, fullKey))
    }
    else {
      keys.push(fullKey)
    }
  }

  return keys
}

// Extract keys from YAML file
function getKeysFromYaml(filePath: string): string[] {
  if (!existsSync(filePath)) {
    return []
  }

  try {
    const content = readFileSync(filePath, 'utf8')
    const parsed = parseYaml(content)
    return extractKeys(parsed)
  }
  catch (error) {
    console.error(`❌ ${filePath} Parsing Error:`, error)
    return []
  }
}

// Check translation completion rate
function checkTranslationFile(enFile: string, koFile: string): TranslationStats {
  const enKeys = getKeysFromYaml(enFile)
  const koKeys = getKeysFromYaml(koFile)
  const koKeySet = new Set(koKeys)

  const missingKeys = enKeys.filter(key => !koKeySet.has(key))
  const translatedKeys = enKeys.length - missingKeys.length
  const completionRate = enKeys.length > 0 ? (translatedKeys / enKeys.length) * 100 : 0

  return {
    file: koFile.split('/').pop() || koFile,
    totalKeys: enKeys.length,
    translatedKeys,
    missingKeys,
    completionRate,
  }
}

// Create progress bar
function createProgressBar(percentage: number, width: number = 20): string {
  const filled = Math.round((percentage / 100) * width)
  const empty = width - filled
  return '█'.repeat(filled) + '░'.repeat(empty)
}

// Color output helper
function colorize(text: string, color: 'red' | 'green' | 'yellow' | 'blue' | 'cyan'): string {
  const colors = {
    red: '\x1B[31m',
    green: '\x1B[32m',
    yellow: '\x1B[33m',
    blue: '\x1B[34m',
    cyan: '\x1B[36m',
    reset: '\x1B[0m',
  }
  return `${colors[color]}${text}${colors.reset}`
}

// Main execution
function main() {
  const basePath = resolve(__dirname, '../packages/i18n/src/locales')

  // 체크할 파일 목록
  const files = [
    'base.yaml',
    'stage.yaml',
    'settings.yaml',
    'tamagotchi/settings.yaml',
    'tamagotchi/stage.yaml',
  ]

  console.log(colorize('\n🧪 Korean Translation Completion Check', 'cyan'))
  console.log('━'.repeat(50))

  let totalOriginalKeys = 0
  let totalTranslatedKeys = 0
  const results: TranslationStats[] = []

  for (const file of files) {
    const enFile = resolve(basePath, 'en', file)
    const koFile = resolve(basePath, 'ko', file)

    const stats = checkTranslationFile(enFile, koFile)
    results.push(stats)

    totalOriginalKeys += stats.totalKeys
    totalTranslatedKeys += stats.translatedKeys

    // 파일별 결과 출력
    const statusIcon = stats.completionRate === 100
      ? '✅'
      : stats.completionRate >= 80
        ? '🟡'
        : stats.completionRate >= 50 ? '🟠' : '❌'

    const progressBar = createProgressBar(stats.completionRate)
    const percentage = stats.completionRate.toFixed(1).padStart(5, ' ')

    console.log(`${statusIcon} ${file.padEnd(25)} ${progressBar} ${percentage}% (${stats.translatedKeys}/${stats.totalKeys})`)

    // Display if missing keys are 50 or fewer (incremental)
    if (stats.missingKeys.length > 0 && stats.missingKeys.length <= 50) {
      console.log(colorize(`   Missing keys: ${stats.missingKeys.join(', ')}`, 'yellow'))
    }
    else if (stats.missingKeys.length > 50) {
      console.log(colorize(`   ${stats.missingKeys.length} missing keys (too many to display)`, 'yellow'))
    }
  }

  // Overall statistics
  const overallCompletion = totalOriginalKeys > 0 ? (totalTranslatedKeys / totalOriginalKeys) * 100 : 0
  console.log('━'.repeat(50))
  console.log(colorize(`📊 Overall completion rate: ${overallCompletion.toFixed(1)}% (${totalTranslatedKeys}/${totalOriginalKeys})`, 'blue'))

  // TDD status evaluation
  console.log('\n🎯 TDD Status:')

  if (overallCompletion === 100) {
    console.log(colorize('🟢 GREEN: All translations are complete!', 'green'))
    process.exit(0)
  }
  else if (overallCompletion >= 80) {
    console.log(colorize('🟡 YELLOW: Almost complete. Just a little more!', 'yellow'))
    process.exit(0)
  }
  else if (overallCompletion >= 50) {
    console.log(colorize('🟠 ORANGE: Halfway there. Keep going!', 'yellow'))
    process.exit(0)
  }
  else {
    console.log(colorize('🔴 RED: Still needs a lot of work.', 'red'))
    process.exit(1)
  }
}

main()

export { checkTranslationFile, extractKeys }
