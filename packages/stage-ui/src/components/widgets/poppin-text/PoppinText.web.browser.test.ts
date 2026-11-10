import type { Animator } from './animators'

import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'

import PoppinText from './PoppinText.web.vue'

type AnimatorMock = ReturnType<typeof vi.fn<Animator>>

async function mountPoppinText(params: {
  text: ReturnType<typeof ref<Array<{ key: string, text: string }>>>
  animator: AnimatorMock
}) {
  const host = document.createElement('div')
  document.body.appendChild(host)

  const app = createApp({
    render: () => h(PoppinText, {
      text: params.text.value,
      animator: params.animator,
    }),
  })

  app.mount(host)
  await nextTick()

  return {
    app,
    host,
  }
}

describe('poppin text', () => {
  it('animates only newly appended keyed text segments', async () => {
    const text = ref([{ key: 'first', text: 'Hi' }])
    const animator = vi.fn<Animator>()
    const { app, host } = await mountPoppinText({ text, animator })

    expect(animator.mock.calls.map(([elements]) => elements.length)).toEqual([2])

    text.value = [
      { key: 'first', text: 'Hi' },
      { key: 'second', text: '!' },
    ]
    await nextTick()
    await nextTick()

    expect(host.textContent).toBe('Hi!')
    expect(animator.mock.calls.map(([elements]) => elements.length)).toEqual([2, 1])

    app.unmount()
    host.remove()
  })

  it('does not reanimate remaining keyed text segments when earlier segments are removed', async () => {
    const text = ref([
      { key: 'first', text: 'Hi' },
      { key: 'second', text: '!' },
    ])
    const animator = vi.fn<Animator>()
    const { app, host } = await mountPoppinText({ text, animator })

    expect(animator.mock.calls.map(([elements]) => elements.length)).toEqual([3])

    text.value = [{ key: 'second', text: '!' }]
    await nextTick()
    await nextTick()

    expect(host.textContent).toBe('!')
    expect(animator.mock.calls.map(([elements]) => elements.length)).toEqual([3])

    app.unmount()
    host.remove()
  })

  it('renders inline graphemes inside the chosen root element', async () => {
    const host = document.createElement('p')
    document.body.appendChild(host)
    const app = createApp({ render: () => h(PoppinText, { text: [{ key: 'one', text: 'Hi' }], as: 'span', inline: true }) })
    app.mount(host)
    await nextTick()

    const root = host.firstElementChild!
    expect(root.tagName).toBe('SPAN')
    expect(root.textContent).toBe('Hi')
    expect(Array.from(root.children).every(span => !span.classList.contains('inline-block'))).toBe(true)

    app.unmount()
    host.remove()
  })
})
