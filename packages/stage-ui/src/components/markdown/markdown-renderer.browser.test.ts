import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, onMounted, ref, useTemplateRef } from 'vue'

import MarkdownRenderer from './markdown-renderer.vue'

const markdown = `### Roof Leak in Server Room

*Anime style virtual AI girl waking up in a server room and noticing water from the ceiling.*

> **Sharing**: Sending a quick sketch to our chat history...`

const MarkdownMountProbe = defineComponent({
  components: {
    MarkdownRenderer,
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
      markdown,
      root,
    }
  },
  template: `
    <div ref="root">
      <MarkdownRenderer :content="markdown" />
    </div>
  `,
})

const MarkdownHarness = defineComponent({
  components: {
    MarkdownMountProbe,
  },
  setup() {
    const mountedHtml = ref('')

    return {
      mountedHtml,
    }
  },
  template: `
    <MarkdownMountProbe @mounted-html="mountedHtml = $event" />
    <output aria-label="initial-markdown-html">{{ mountedHtml }}</output>
  `,
})

describe('markdown renderer initial content', () => {
  it('renders basic Markdown before mounted layout code reads the element', async () => {
    // ROOT CAUSE:
    //
    // MarkdownRenderer started with empty HTML and filled it after an awaited promise.
    // TransitionVertical measured that empty element and kept the stale height for 250 ms.
    // The content jumped to its real height when the animation released its fixed height.
    //
    // We fixed this by rendering basic Markdown synchronously before optional rich processing.
    const screen = await render(MarkdownHarness)

    await expect.element(screen.getByLabelText('initial-markdown-html')).toHaveTextContent('<h3>Roof Leak in Server Room</h3>')
  })
})
