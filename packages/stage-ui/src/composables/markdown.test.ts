import { describe, expect, it } from 'vitest'

import { useMarkdown } from './markdown'

function mathNodeCount(html: string): number {
  return html.match(/<math/g)?.length ?? 0
}

describe('useMarkdown', () => {
  // https://github.com/moeru-ai/airi/discussions/2239
  it('renders each LaTeX fence line as display math for Issue #2239', async () => {
    // ROOT CAUSE:
    //
    // Markdown treats a LaTeX fence as source code. The old fix then tried to
    // infer formula boundaries from relations and operators in each line.
    //
    // We define a chat syntax instead. Each non-empty line in a `latex` or
    // `tex` fence is one display formula.
    const markdown = [
      '```latex',
      String.raw`\frac{d}{dx}(c)=0`,
      String.raw`\frac{d}{dx}(x^n)=n x^{n-1}`,
      String.raw`\frac{d}{dx}(e^x)=e^x`,
      String.raw`\int c\,dx = cx + C`,
      String.raw`\int x^n\,dx = \frac{x^{n+1}}{n+1}+C`,
      String.raw`\int \sin x\,dx = -\cos x + C`,
      '```',
    ].join('\n')

    const { process, processSync } = useMarkdown()
    const initialHtml = processSync(markdown)
    const html = await process(markdown)

    expect(mathNodeCount(initialHtml)).toBe(6)
    expect(html).not.toContain('class="shiki')
    expect(mathNodeCount(html)).toBe(6)
    expect(html).toContain('<annotation encoding="application/x-tex">\\frac{d}{dx}(c)=0')
    expect(html).toContain('<annotation encoding="application/x-tex">\\frac{d}{dx}(x^n)=n x^{n-1}')
    expect(html).toContain('<annotation encoding="application/x-tex">\\frac{d}{dx}(e^x)=e^x')
    expect(html).toContain('<annotation encoding="application/x-tex">\\int c\\,dx = cx + C')
    expect(html).toContain('<annotation encoding="application/x-tex">\\int x^n\\,dx = \\frac{x^{n+1}}{n+1}+C')
  })

  // https://github.com/moeru-ai/airi/pull/2328#discussion_r3818349198
  it('renders formula-list rows without a relation allowlist', () => {
    // ROOT CAUSE:
    //
    // The old splitter required a known relation on every line. Commands such
    // as `\in`, `\notin`, and `\subseteq` form an open set. Expressions can
    // also be independent formulas without any relation.
    //
    // We fixed this by making physical rows part of the `latex` fence syntax.
    const markdown = [
      '```latex',
      String.raw`x \in A`,
      String.raw`y \notin B`,
      String.raw`A \subseteq C`,
      String.raw`\sin x`,
      '```',
    ].join('\n')

    const html = useMarkdown().processSync(markdown)

    expect(mathNodeCount(html)).toBe(4)
  })

  // https://github.com/moeru-ai/airi/discussions/2239
  it('supports the explicit tex rows alias with blank rows and CRLF for Issue #2239', () => {
    const markdown = [
      '```tex rows',
      String.raw`\int c\,dx = cx + C`,
      '',
      String.raw`\int e^x\,dx = e^x + C`,
      '```',
    ].join('\r\n')

    const html = useMarkdown().processSync(markdown)

    expect(mathNodeCount(html)).toBe(2)
  })

  // https://github.com/moeru-ai/airi/pull/2328
  it('keeps a latex block as one formula without inspecting its rows', () => {
    // ROOT CAUSE:
    //
    // Content heuristics split any rows that looked like complete equations.
    // This ignored the fence mode and changed macro scope and layout.
    //
    // We fixed this by making `block` the only boundary decision.
    const markdown = [
      '```latex block',
      'x = 1',
      'y = 2',
      '```',
    ].join('\n')

    const html = useMarkdown().processSync(markdown)

    expect(mathNodeCount(html)).toBe(1)
    expect(html).toContain('x = 1\ny = 2')
  })

  // https://github.com/moeru-ai/airi/pull/2328#discussion_r3819441402
  it('keeps syntax highlighting when a math fence has metadata', async () => {
    // ROOT CAUSE:
    //
    // The rich pipeline loaded the complete fence info string as a Shiki
    // language. For example, it tried to load `latex block`. Shiki rejected
    // that name, and the fallback removed highlighting from unrelated code.
    //
    // The language loader must read only the first info-string token.
    const markdown = [
      '```latex block',
      'x = 1',
      'y = 2',
      '```',
      '',
      '```typescript',
      'const answer = 42',
      '```',
    ].join('\n')

    const html = await useMarkdown().process(markdown)

    expect(mathNodeCount(html)).toBe(1)
    expect(html).toContain('class="shiki')
    expect(html).toContain('>const</span>')
    expect(html).toContain('> answer</span>')
  })

  // https://github.com/moeru-ai/airi/pull/2328#discussion_r3812513778
  it('keeps command arguments together in a latex block', () => {
    const markdown = [
      '```latex block',
      String.raw`\frac{a=b}`,
      String.raw`{c=d}`,
      '```',
    ].join('\n')

    const html = useMarkdown().processSync(markdown)

    expect(mathNodeCount(html)).toBe(1)
    expect(html).not.toContain('<merror')
    expect(html).toContain('\\frac{a=b}\n{c=d}')
  })

  // https://github.com/moeru-ai/airi/pull/2328#discussion_r3818140362
  it('keeps paired delimiters together in a tex block', () => {
    const markdown = [
      '```tex block',
      String.raw`\left(x=1`,
      String.raw`\right)=y`,
      '```',
    ].join('\n')

    const html = useMarkdown().processSync(markdown)

    expect(mathNodeCount(html)).toBe(1)
    expect(html).not.toContain('katex-error')
    expect(html).toContain('\\left(x=1\n\\right)=y')
  })

  // https://github.com/moeru-ai/airi/pull/2328#discussion_r3818173297
  it('keeps optional command arguments together in a latex block', () => {
    const markdown = [
      '```latex block',
      String.raw`y = \sqrt`,
      '[3]{x = z}',
      '```',
    ].join('\n')

    const html = useMarkdown().processSync(markdown)

    expect(mathNodeCount(html)).toBe(1)
    expect(html).not.toContain('katex-error')
    expect(html).toContain('y = \\sqrt\n[3]{x = z}')
  })

  // https://github.com/moeru-ai/airi/pull/2328#discussion_r3818250572
  it('keeps scripts together in a latex block', () => {
    const markdown = [
      '```latex block',
      String.raw`S = \sum`,
      String.raw`_{i=1}^{n} i = n(n+1)/2`,
      '```',
    ].join('\n')

    const html = useMarkdown().processSync(markdown)

    expect(mathNodeCount(html)).toBe(1)
    expect(html).not.toContain('katex-error')
    expect(html).toContain('S = \\sum\n_{i=1}^{n} i = n(n+1)/2')
  })

  it('keeps a multiline math fence as one formula', () => {
    const markdown = [
      '```math',
      String.raw`\begin{aligned}`,
      String.raw`f(x) &= x^2 \\`,
      String.raw`f'(x) &= 2x`,
      String.raw`\end{aligned}`,
      '```',
    ].join('\n')

    const html = useMarkdown().processSync(markdown)

    expect(mathNodeCount(html)).toBe(1)
    expect(html).not.toContain('<merror')
    expect(html).toContain('\\begin{aligned}')
    expect(html).toContain('\\end{aligned}')
  })

  it('keeps macros and their uses in one tex block', () => {
    const markdown = [
      '```tex block',
      String.raw`\newcommand{\foo}{x=1}`,
      String.raw`\foo=2`,
      '```',
    ].join('\n')

    const html = useMarkdown().processSync(markdown)

    expect(mathNodeCount(html)).toBe(1)
    expect(html).not.toContain('<merror')
    expect(html).toContain('\\newcommand{\\foo}{x=1}\n\\foo=2')
  })

  // https://github.com/moeru-ai/airi/discussions/2239
  it('keeps single dollar signs as text for Issue #2239', () => {
    // ROOT CAUSE:
    //
    // Single-dollar math pairs normal currency signs before Markdown can know
    // whether the content is prose or a formula. Word-based recovery rules
    // then conflict with valid variables and units.
    //
    // We fixed this by disabling single-dollar math for the chat syntax.
    const markdown = [
      'Price is $5 and cost is $10.',
      'Prices are $5 and $10.',
      'Tickets cost $5-$10.',
      'Tickets cost $5 to $10.',
      'The old formula syntax is $5 + x$.',
      'Values are $5$ and $10$.',
    ].join('\n\n')

    const html = useMarkdown().processSync(markdown)

    expect(mathNodeCount(html)).toBe(0)
    expect(html).toContain('Price is $5 and cost is $10.')
    expect(html).toContain('Prices are $5 and $10.')
    expect(html).toContain('Tickets cost $5-$10.')
    expect(html).toContain('Tickets cost $5 to $10.')
    expect(html).toContain('The old formula syntax is $5 + x$.')
    expect(html).toContain('Values are $5$ and $10$.')
  })

  it('renders double-dollar inline math', () => {
    const html = useMarkdown().processSync('The result is $$5 + x$$.')

    expect(mathNodeCount(html)).toBe(1)
    expect(html).toContain('<annotation encoding="application/x-tex">5 + x</annotation>')
  })

  it('renders each display-math block as one formula', () => {
    const markdown = [
      '$$',
      'x = 1',
      '$$',
      '',
      '$$',
      String.raw`y \in A`,
      '$$',
    ].join('\n')

    const html = useMarkdown().processSync(markdown)

    expect(mathNodeCount(html)).toBe(2)
  })

  it('keeps invalid formula source visible', () => {
    const html = useMarkdown().processSync('$$\\notacommand{x}$$')

    expect(html).toContain('\\notacommand{x}')
    expect(html).not.toContain('<a href=')
  })

  it('does not create a link for an untrusted KaTeX URL', () => {
    const html = useMarkdown().processSync(String.raw`$$\href{javascript:alert(1)}{x}$$`)

    expect(html).toContain(String.raw`\href{javascript:alert(1)}{x}`)
    expect(html).not.toContain('<a href=')
  })
})
