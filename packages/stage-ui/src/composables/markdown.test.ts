import { describe, expect, it } from 'vitest'

import { useMarkdown } from './markdown'

describe('useMarkdown', () => {
  // https://github.com/moeru-ai/airi/discussions/2239
  it('renders each LaTeX fence line as display math (Issue #2239)', async () => {
    // ROOT CAUSE:
    //
    // LaTeX fences are parsed as source code, so Shiki highlights commands
    // instead of sending equations to KaTeX. Treating the whole fence as one
    // math block would also join separate equations on the same line.
    const markdown = [
      '```latex',
      String.raw`\frac{d}{dx}(c)=0`,
      String.raw`\frac{d}{dx}(x^n)=n x^{n-1}`,
      String.raw`\frac{d}{dx}(e^x)=e^x`,
      '```',
    ].join('\n')

    const { process, processSync } = useMarkdown()
    const initialHtml = processSync(markdown)
    const html = await process(markdown)

    expect(initialHtml.match(/<math/g) ?? []).toHaveLength(3)
    expect(html).not.toContain('class="shiki')
    expect(html.match(/<math/g) ?? []).toHaveLength(3)
    expect(html).toContain('<annotation encoding="application/x-tex">\\frac{d}{dx}(c)=0')
    expect(html).toContain('<annotation encoding="application/x-tex">\\frac{d}{dx}(x^n)=n x^{n-1}')
    expect(html).toContain('<annotation encoding="application/x-tex">\\frac{d}{dx}(e^x)=e^x')
  })

  // https://github.com/moeru-ai/airi/discussions/2239
  it('treats a tex fence as display math (Issue #2239)', async () => {
    const markdown = [
      '```tex',
      String.raw`\int c\,dx = cx + C`,
      '```',
    ].join('\n')

    const html = await useMarkdown().process(markdown)

    expect(html).toContain('<math')
    expect(html).toContain('<annotation encoding="application/x-tex">\\int c\\,dx = cx + C')
  })

  // https://github.com/moeru-ai/airi/discussions/2239
  it('keeps two currency amounts as text (Issue #2239)', () => {
    // ROOT CAUSE:
    //
    // remark-math pairs the dollar sign before 5 with the dollar sign before
    // 10, which turns the words between two prices into an inline equation.
    const markdown = 'Price is $5 and cost is $10.'

    const html = useMarkdown().processSync(markdown)

    expect(html).toBe('<p>Price is $5 and cost is $10.</p>')
    expect(html).not.toContain('<math')
  })

  it('keeps numeric-leading inline math', () => {
    const html = useMarkdown().processSync('The result is $5 + x$.')

    expect(html).toContain('<math')
    expect(html).toContain('<annotation encoding="application/x-tex">5 + x</annotation>')
  })

  it('keeps numeric-leading inline math with trailing whitespace before prose', () => {
    // ROOT CAUSE:
    //
    // A price-only check mistakes a numeric-leading equation for prose when
    // the equation ends in whitespace and the next text starts with a digit.
    const html = useMarkdown().processSync('The result is $5 + x $ 7 days later.')

    expect(html).toContain('<math')
    expect(html).toContain('<annotation encoding="application/x-tex">5 + x </annotation>')
  })

  it('keeps separate price formulas when both dollar signs close math', () => {
    const html = useMarkdown().processSync('Values are $5$ and $10$.')

    expect(html.match(/<math/g) ?? []).toHaveLength(2)
  })
})
