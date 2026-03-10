<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  defaultHeight?: string
  sendKey?: 'enter' | 'shift-enter'
}>(), {
  sendKey: 'enter',
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
  if (e.code !== 'Enter')
    return

  const shouldSubmit = props.sendKey === 'enter'
    ? !e.shiftKey
    : e.shiftKey

  if (shouldSubmit) {
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
  textareaHeight.value = 'auto'
  requestAnimationFrame(() => {
    if (!textareaRef.value)
      return
    if (input.value === '') {
      textareaHeight.value = props.defaultHeight || 'fit-content'
      return
    }

    textareaHeight.value = `${textareaRef.value.scrollHeight}px`
  })
}, { immediate: true })
</script>

<template>
  <textarea
    ref="textareaRef"
    v-model="input"
    :style="{ height: textareaHeight }"
    @keydown="onKeyDown"
    @paste="onPaste"
  />
</template>
