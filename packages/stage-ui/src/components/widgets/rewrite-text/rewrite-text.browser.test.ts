import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'

import RewriteText from './rewrite-text.vue'

/** Short motion keeps the test fast. The stagger and the blur follow the same code path as the default motion. */
const motion = { durationMs: 30, staggerMs: 5 }

describe('rewriteText', () => {
  it('animates only the changed words, at every place, then shows the new text as plain text', async () => {
    const onFinished = vi.fn()
    const view = render(RewriteText, { props: { from: 'um turn on the lite please', to: 'Turn on the light, please.', motion, onFinished } })
    const root = view.container.firstElementChild!

    // While old words leave, unchanged words stay whole and each removed grapheme is its own span.
    const leaving = Array.from(root.children).map(span => span.textContent)
    expect(leaving.join('')).toBe('um turn on the lite please')
    expect(leaving).toContain(' on the ')
    expect(leaving.filter(text => text?.length === 1).join('')).toBe('um turnlite')

    await vi.waitFor(() => expect(onFinished).toHaveBeenCalledOnce())
    expect(root.textContent).toBe('Turn on the light, please.')
    expect(root.children).toHaveLength(1)
    expect(root.querySelectorAll('[style*="blur"]')).toHaveLength(0)
  })

  it('finishes without animated graphemes when the text did not change', async () => {
    const onFinished = vi.fn()
    const view = render(RewriteText, { props: { from: 'Hello.', to: 'Hello.', motion, onFinished } })

    await vi.waitFor(() => expect(onFinished).toHaveBeenCalledOnce())
    expect(view.container.textContent).toBe('Hello.')
    expect(view.container.firstElementChild?.children).toHaveLength(1)
  })
})
