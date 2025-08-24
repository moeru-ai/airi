<!-- PoppinMarkdown - PoppinText with markdown support -->
<script setup lang="ts">
import type { Element, Root } from 'hast'

import type { Animator } from './animators'

import RemarkParse from 'remark-parse'
import RemarkRehype from 'remark-rehype'

import { readGraphemeClusters } from 'clustr'
import { unified } from 'unified'
import { computed, defineComponent, h, ref, shallowRef, watch } from 'vue'

const props = withDefaults(defineProps<{
  /**
   * A plain string or a ReadableStream of bytes from text in UTF-8 encoding.
   * If a stream is provided, the stream **SHOULD NOT** be reused.
   */
  text?: string | ReadableStream<Uint8Array>
  textClass?: string | string[]
  animator?: Animator
  /**
   * Whether to process the accumulated text as markdown
   * @default true
   */
  markdown?: boolean
}>(), {
  markdown: true,
})

const emits = defineEmits<{
  (e: 'textSplit', grapheme: string): void
  (e: 'markdownUpdated', html: string): void
}>()

const targets = ref<string[]>([])
const abortController = shallowRef<AbortController>()
const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' })

// Accumulate all text content
const accumulatedText = ref('')
const animatedCharCount = ref(0)

// Create markdown processor
const processor = unified()
  .use(RemarkParse)
  .use(RemarkRehype)

// Convert HAST to Vue render function
function hastToVNode(node: any, animator?: Animator): any {
  if (node.type === 'text') {
    // Text node - split into animated characters
    const textContent = node.value.trim()
    if (!textContent)
      return null

    const characters = [...segmenter.segment(textContent)].map(seg => seg.segment)
    const currentAnimatedCount = animatedCharCount.value

    return characters.map((char, index) => {
      const globalIndex = currentAnimatedCount + index

      return h('span', {
        key: `char-${globalIndex}`,
        class: 'inline-block poppin-char',
        onVnodeMounted: (vnode: any) => {
          if (animator && vnode.el) {
            setTimeout(() => animator([vnode.el]), 0)
          }
        },
      }, char)
    })
  }

  if (node.type === 'element') {
    const element = node as Element
    const { tagName, properties = {}, children = [] } = element

    // Check if this is a non-text element that should animate as a unit
    const isNonTextElement = ['img', 'code', 'pre', 'hr', 'br'].includes(tagName)
      || (properties.className
        && (properties.className as string[]).includes('code-block'))

    if (isNonTextElement) {
      return h(tagName, {
        ...properties,
        key: `element-${tagName}-${animatedCharCount.value}`,
        class: [properties.className, 'poppin-element'],
        onVnodeMounted: (vnode: any) => {
          if (animator && vnode.el) {
            setTimeout(() => animator([vnode.el]), 0)
          }
        },
      })
    }

    // Regular element - recursively process children
    const childVNodes = children
      .map((child: any) => hastToVNode(child, animator))
      .flat()
      .filter(Boolean)

    return h(tagName, properties, childVNodes)
  }

  return null
}

// Parse markdown to HAST and create Vue component
const MarkdownComponent = computed(() => {
  if (!props.markdown || !accumulatedText.value) {
    // Fallback to character animation
    // eslint-disable-next-line vue/one-component-per-file
    return defineComponent({
      setup() {
        return () => targets.value.map((char, index) =>
          h('span', {
            key: `fallback-${index}`,
            class: 'inline-block color-primary-400 dark:color-primary-100',
            onVnodeMounted: (vnode: any) => {
              if (props.animator && vnode.el) {
                setTimeout(() => props.animator?.([vnode.el]), 0)
              }
            },
          }, char),
        )
      },
    })
  }

  try {
    const ast = processor.parse(accumulatedText.value)
    const hast = processor.runSync(ast) as Root

    // eslint-disable-next-line vue/one-component-per-file
    return defineComponent({
      setup() {
        return () => h('div', {
          class: ['markdown-content', props.textClass].flat().filter(Boolean),
        }, hast.children.map((child: any) => hastToVNode(child, props.animator)))
      },
    })
  }
  catch (error) {
    console.warn('Markdown parsing failed:', error)
    return null
  }
})

// Update character count when streaming
watch(accumulatedText, (newText, oldText) => {
  if (newText.length > (oldText?.length || 0)) {
    // Only update count when new characters are added
    const addedChars = newText.slice(oldText?.length || 0)
    const addedCharCount = [...segmenter.segment(addedChars)].length
    animatedCharCount.value += addedCharCount
  }
  else if (newText.length < (oldText?.length || 0)) {
    // Text was reset, reset count
    animatedCharCount.value = 0
  }

  emits('markdownUpdated', newText)
})

// Reset animation count when text prop changes
watch(() => props.text, () => {
  animatedCharCount.value = 0
}, { flush: 'pre' })

watch(() => props.text, async (text) => {
  if (!text) {
    accumulatedText.value = ''
    targets.value = []
    return
  }

  if (typeof text === 'string') {
    accumulatedText.value = text
    targets.value = [...segmenter.segment(text)].map(seg => seg.segment)
  }
  else {
    abortController.value?.abort()
    abortController.value = new AbortController()
    try {
      targets.value = []
      accumulatedText.value = ''

      for await (const cluster of readGraphemeClusters(text.getReader(), { signal: abortController.value.signal })) {
        accumulatedText.value += cluster
        targets.value.push(cluster)
        emits('textSplit', cluster)
      }
    }
    catch (error) {
      if (error instanceof Error && error.message === 'Aborted') {
        console.warn('Text reading aborted')
      }
      else {
        console.error('Error reading text:', error)
      }
    }
  }
}, { immediate: true })
</script>

<template>
  <component
    :is="MarkdownComponent"
    :key="accumulatedText.length"
  />
</template>
