import type { SelectedRecallCandidate } from './select-short-term-candidates'

export interface AssembleRecallContextOutput {
  text: string
  estimatedTokens: number
}

export function assembleRecallContext(
  selected: SelectedRecallCandidate[],
): AssembleRecallContextOutput {
  if (selected.length === 0) {
    return {
      text: '',
      estimatedTokens: 0,
    }
  }

  const lines: string[] = []
  lines.push('Alaya memory recall (reference-only):')
  lines.push('Use only if relevant to the current request.')
  lines.push('')

  let estimatedTokens = 0
  selected.forEach((candidate) => {
    const entryLines = candidate.contextText.split('\n')
    if (entryLines.length > 0) {
      lines.push(`- ${entryLines[0]}`)
      entryLines.slice(1).forEach(line => lines.push(`  ${line}`))
    }
    lines.push('')
    estimatedTokens += candidate.estimatedTokens
  })

  return {
    text: lines.join('\n').trim(),
    estimatedTokens,
  }
}
