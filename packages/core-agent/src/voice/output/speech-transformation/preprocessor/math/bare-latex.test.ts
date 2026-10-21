import { describe, expect, it } from 'vitest'

import { findBareLatex } from './bare-latex'

describe('findBareLatex', () => {
  function spans(text: string) {
    return findBareLatex(text).map(({ start, end }) => text.slice(start, end))
  }

  it('finds known commands and scripts with their operands', () => {
    expect(spans(String.raw`设 \alpha 为锐角，且 a \leq b。`)).toEqual([String.raw`\alpha`, String.raw`a \leq b`])
    expect(spans(String.raw`The bare \ce{H2O} is water, and \frac{1}{2} is half.`)).toEqual([String.raw`\ce{H2O}`, String.raw`\frac{1}{2}`])
    expect(spans('E = mc^2 holds.')).toEqual(['E = mc^2'])
    expect(spans('file_name and x_{i+1}')).toEqual(['x_{i+1}'])
  })

  it('ignores paths and unknown commands', () => {
    expect(spans(String.raw`Open C:\Users\neko now.`)).toEqual([])
    expect(spans(String.raw`\newcommand is not read.`)).toEqual([])
  })
})
