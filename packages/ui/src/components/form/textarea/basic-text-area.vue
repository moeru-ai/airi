<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  defaultHeight?: string
  submitOnEnter?: boolean
}>(), {
  submitOnEnter: true,
})

const events = defineEmits<{
  (event: 'submit', message: string): void
  (event: 'pasteFile', files: File[]): void
}>()

const input = defineModel<string>({
  default: '',
})

const textareaRef = ref<HTMLTextAreaElement>()
const textareaHeight = ref('auto')

function onKeyDown(e: KeyboardEvent) {
  if (!props.submitOnEnter)
    return

  if (e.code === 'Enter' && !e.shiftKey) { // just block Enter is enough, Shift+Enter by default generates a newline
    e.preventDefault()
    events('submit', input.value)
  }
}

function onPaste(e: ClipboardEvent) {
  if (!e.clipboardData)
    return

  const { files } = e.clipboardData
  if (files.length > 0) {
    e.preventDefault()
    events('pasteFile', Array.from(files))
  }
}

// javascript - Creating a textarea with auto-resize - Stack Overflow
// https://stackoverflow.com/questions/454202/creating-a-textarea-with-auto-resize
watch(input, () => {
  // An explicit baseline prevents a flex parent's minimum height from
  // stretching the textarea before scrollHeight measures its content.
  textareaHeight.value = props.defaultHeight || 'auto'
  requestAnimationFrame(() => {
    if (!textareaRef.value)
      return
    if (input.value === '') {
      textareaHeight.value = props.defaultHeight || 'fit-content'
      return
    }

    // scrollHeight includes padding but excludes borders. A border-box height adds the real border widths.
    // A fixed 2px per border made borderless textareas grow 4px on the first input.
    const style = getComputedStyle(textareaRef.value)
    const borders = Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth)
    textareaHeight.value = `${textareaRef.value.scrollHeight + borders}px`
  })
}, { immediate: true })
</script>

<template>
  <textarea
    ref="textareaRef"
    v-model="input"
    rows="1"
    :style="{ height: textareaHeight }"
    @keydown="onKeyDown"
    @paste="onPaste"
  />
</template>
