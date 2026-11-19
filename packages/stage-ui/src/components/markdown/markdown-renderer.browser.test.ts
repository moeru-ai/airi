import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, onMounted, ref, useTemplateRef } from 'vue'

import MarkdownRenderer from './markdown-renderer.vue'

const MarkdownMountProbe = defineComponent({
  components: {
    MarkdownRenderer,
  },
  props: {
    markdown: {
      type: String,
      required: true,
    },
  },
  emits: {
    mountedHtml: (html: string) => typeof html === 'string',
  },
  setup(_, { emit }) {
    const root = useTemplateRef<HTMLElement>('root')

    onMounted(() => {
      emit('mountedHtml', root.value?.innerHTML ?? '')
    })

    return {
      root,
    }
  },
  template: `
    <div ref="root">
      <MarkdownRenderer :content="markdown" />
    </div>
  `,
})

function createMarkdownHarness(markdown: string, label: string) {
  return defineComponent({
    components: {
      MarkdownMountProbe,
    },
    setup() {
      const mountedHtml = ref('')

      return {
        label,
        markdown,
        mountedHtml,
      }
    },
    template: `
      <MarkdownMountProbe :markdown="markdown" @mounted-html="mountedHtml = $event" />
      <output :aria-label="label">{{ mountedHtml }}</output>
    `,
  })
}

describe('markdown renderer initial content', () => {
  // https://github.com/moeru-ai/airi/issues/2796
  // ROOT CAUSE:
  // The component requested rich processing only for backtick fences.
  // We fixed this by also requesting it for tilde fences.
  it('highlights a tilde-only message for Issue #2796', async () => {
    const screen = await render(MarkdownRenderer, {
      props: { content: '~~~typescript\nconst answer = 42\n~~~' },
    })

    await expect.poll(() => screen.container.querySelector('pre')?.className).toContain('shiki')
    await expect.element(screen.getByText('const answer = 42')).toBeVisible()
  })

  it('renders basic Markdown before mounted layout code reads the element', async () => {
    // ROOT CAUSE:
    //
    // MarkdownRenderer started with empty HTML and filled it after an awaited promise.
    // TransitionVertical measured that empty element and kept the stale height for 250 ms.
    // The content jumped to its real height when the animation released its fixed height.
    //
    // We fixed this by rendering basic Markdown synchronously before optional rich processing.
    const markdown = `### Roof Leak in Server Room

*Anime style virtual AI girl waking up in a server room and noticing water from the ceiling.*

> **Sharing**: Sending a quick sketch to our chat history...`
    const screen = await render(createMarkdownHarness(markdown, 'initial-markdown-html'))

    await expect.element(screen.getByLabelText('initial-markdown-html')).toHaveTextContent('<h3>Roof Leak in Server Room</h3>')
  })

  // https://github.com/moeru-ai/airi/discussions/2239
  it('renders double-dollar math without consuming currency for Issue #2239', async () => {
    // ROOT CAUSE:
    //
    // Single-dollar math can pair two currency signs. The rendered component
    // then displays normal prose as a formula.
    //
    // We fixed this by keeping single dollars as text and using double dollars
    // for inline math.
    const markdown = 'Price is $5 and cost is $10.\n\nThe result is $$x^2$$.'
    const screen = await render(createMarkdownHarness(markdown, 'chat-math-html'))
    const html = screen.getByLabelText('chat-math-html')

    await expect.element(html).toHaveTextContent('Price is $5 and cost is $10.')
    await expect.element(html).toHaveTextContent('<math')
    await expect.element(html).not.toHaveTextContent('katex-error')
  })
})
