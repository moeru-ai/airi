<script setup lang="ts" generic="T extends any, O extends any">
import type { CSSProperties } from 'vue'
import { nextTick, onMounted, ref } from 'vue'

const events = defineEmits<{
  (event: 'submit', message: string): void
}>()

const input = defineModel<string>({
  default: '',
})

const textareaRef = ref<HTMLTextAreaElement>()
const textareaStyle = ref<CSSProperties>({
  height: 'auto',
  overflowY: 'hidden',
})

// javascript - Creating a textarea with auto-resize - Stack Overflow
// https://stackoverflow.com/questions/454202/creating-a-textarea-with-auto-resize
function onInput(e: Event) {
  if (!(e.target instanceof HTMLTextAreaElement))
    return

  e.target.style.height = 'auto'
  e.target.style.height = `${e.target.scrollHeight}px`
}

// javascript - How do I detect "shift+enter" and generate a new line in Textarea? - Stack Overflow
// https://stackoverflow.com/questions/6014702/how-do-i-detect-shiftenter-and-generate-a-new-line-in-textarea
function onKeyDown(e: KeyboardEvent) {
  if (!(e.target instanceof HTMLTextAreaElement))
    return

  if (e.code === 'Enter' && e.shiftKey) {
    e.preventDefault()
    const start = e.target?.selectionStart
    const end = e.target?.selectionEnd
    input.value = `${input.value.substring(0, start)}\n${input.value.substring(end)}`

    // javascript - height of textarea increases when value increased but does not reduce when value is decreased - Stack Overflow
    // https://stackoverflow.com/questions/10722058/height-of-textarea-increases-when-value-increased-but-does-not-reduce-when-value
    textareaStyle.value.height = '0'

    nextTick().then(() => {
      if (!textareaRef.value)
        return

      textareaRef.value.selectionStart = textareaRef.value.selectionEnd = start + 1
      textareaStyle.value.height = `${textareaRef.value.scrollHeight}px`
    })
  }
  else if (e.code === 'Enter') { // block enter
    e.preventDefault()
    events('submit', input.value)
  }
}

onMounted(() => {
  if (!textareaRef.value)
    return

  textareaStyle.value.height = `${textareaRef.value.scrollHeight}px`
})
</script>

<template>
  <textarea
    ref="textareaRef"
    v-model="input"
    :style="textareaStyle"
    @input="onInput"
    @keydown="onKeyDown"
  />
</template>
