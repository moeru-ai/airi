<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  defaultHeight?: string
  sendMode?: 'enter' | 'ctrl-enter' | 'double-enter'
}>()

const events = defineEmits<{
  (event: 'submit', message: string): void
  (event: 'pasteFile', files: File[]): void
}>()

const input = defineModel<string>({
  default: '',
})

const textareaRef = ref<HTMLTextAreaElement>()
const textareaHeight = ref('auto')
const lastEnterAt = ref(0)

function emitSubmit() {
  events('submit', input.value.replace(/[\r\n]+$/, ''))
}

function onKeyDown(e: KeyboardEvent) {
  if (e.isComposing || e.code !== 'Enter')
    return

  const sendMode = props.sendMode || 'enter'
  const hasPrimaryModifier = e.ctrlKey || e.metaKey

  if (sendMode === 'enter') {
    if (!e.shiftKey && !hasPrimaryModifier) {
      e.preventDefault()
      emitSubmit()
    }
    return
  }

  if (sendMode === 'ctrl-enter') {
    if (hasPrimaryModifier) {
      e.preventDefault()
      emitSubmit()
    }
    return
  }

  if (!e.shiftKey && !hasPrimaryModifier) {
    const now = Date.now()
    if (now - lastEnterAt.value <= 350) {
      e.preventDefault()
      lastEnterAt.value = 0
      emitSubmit()
      return
    }

    lastEnterAt.value = now
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
