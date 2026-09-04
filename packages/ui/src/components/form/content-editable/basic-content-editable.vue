<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  defaultHeight?: string
  placeholder?: string
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

const editableRef = ref<HTMLDivElement>()

function readEditableText(element: HTMLDivElement) {
  // Browsers add block elements for Enter. textContent drops their line breaks.
  // eslint-disable-next-line unicorn/prefer-dom-node-text-content
  return element.innerText.replaceAll('\r\n', '\n')
}

function syncEditableValue() {
  const editable = editableRef.value
  if (!editable || readEditableText(editable) === input.value)
    return

  editable.textContent = input.value
}

function onInput(event: Event) {
  const editable = event.currentTarget
  if (!(editable instanceof HTMLDivElement))
    return

  input.value = readEditableText(editable)
}

function onKeyDown(event: KeyboardEvent) {
  if (!props.submitOnEnter || event.code !== 'Enter' || event.shiftKey)
    return

  event.preventDefault()
  events('submit', input.value)
}

function onPaste(event: ClipboardEvent) {
  const clipboard = event.clipboardData
  if (!clipboard)
    return

  const files = Array.from(clipboard.files)
  if (files.length > 0) {
    event.preventDefault()
    events('pasteFile', files)
    return
  }

  event.preventDefault()
  const editable = event.currentTarget
  if (!(editable instanceof HTMLDivElement))
    return

  insertPlainText(editable, clipboard.getData('text/plain'))
  input.value = readEditableText(editable)
}

function insertPlainText(editable: HTMLDivElement, text: string) {
  const selection = window.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined
  if (!selection || !range || !editable.contains(range.commonAncestorContainer)) {
    editable.append(document.createTextNode(text))
    return
  }

  range.deleteContents()
  const textNode = document.createTextNode(text)
  range.insertNode(textNode)
  range.setStartAfter(textNode)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

watch(input, () => {
  void nextTick(syncEditableValue)
}, { immediate: true })
</script>

<template>
  <div
    ref="editableRef"
    contenteditable="true"
    role="textbox"
    aria-multiline="true"
    :aria-label="props.placeholder"
    :data-placeholder="props.placeholder"
    :style="{ minHeight: props.defaultHeight }"
    class="empty:before:pointer-events-none empty:before:content-[attr(data-placeholder)]"
    @input="onInput"
    @keydown="onKeyDown"
    @paste="onPaste"
  />
</template>
