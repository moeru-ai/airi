<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'

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
const editableHeight = ref('auto')
let resizeFrame: number | undefined

function readEditableText(element: HTMLDivElement) {
  if (element.textContent === '')
    return ''

  // Browsers add block elements for Enter. textContent drops their line breaks.
  // eslint-disable-next-line unicorn/prefer-dom-node-text-content
  return element.innerText.replaceAll('\r\n', '\n')
}

function removeTrailingFillerBreak(editable: HTMLDivElement) {
  const filler = editable.lastChild
  if (!(filler instanceof HTMLBRElement) || !(filler.previousSibling instanceof HTMLBRElement))
    return

  filler.remove()
}

function getSelectionOffsets(editable: HTMLDivElement) {
  const selection = window.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined
  if (!selection || !range || !editable.contains(range.startContainer) || !editable.contains(range.endContainer))
    return

  const startRange = document.createRange()
  startRange.selectNodeContents(editable)
  startRange.setEnd(range.startContainer, range.startOffset)

  const endRange = document.createRange()
  endRange.selectNodeContents(editable)
  endRange.setEnd(range.endContainer, range.endOffset)

  return {
    start: startRange.toString().length,
    end: endRange.toString().length,
  }
}

function restoreSelection(editable: HTMLDivElement, previousValue: string, offsets: ReturnType<typeof getSelectionOffsets>) {
  if (!offsets)
    return

  const selection = window.getSelection()
  if (!selection)
    return

  const followsPreviousEnd = offsets.start === previousValue.length && offsets.end === previousValue.length
  const start = followsPreviousEnd ? input.value.length : Math.min(offsets.start, input.value.length)
  const end = followsPreviousEnd ? input.value.length : Math.min(offsets.end, input.value.length)
  const range = document.createRange()
  const textNode = editable.firstChild

  if (textNode?.nodeType === Node.TEXT_NODE) {
    range.setStart(textNode, start)
    range.setEnd(textNode, end)
  }
  else {
    range.selectNodeContents(editable)
    range.collapse(true)
  }

  selection.removeAllRanges()
  selection.addRange(range)
}

function syncEditableValue(force = false) {
  const editable = editableRef.value
  if (!editable)
    return

  const previousValue = readEditableText(editable)
  if (!force && previousValue === input.value)
    return

  const selectionOffsets = getSelectionOffsets(editable)
  editable.textContent = input.value
  restoreSelection(editable, previousValue, selectionOffsets)
}

function getResizedHeight(editable: HTMLDivElement, defaultBoxHeight: number) {
  const styles = getComputedStyle(editable)
  const borderHeight = Number.parseFloat(styles.borderTopWidth) + Number.parseFloat(styles.borderBottomWidth)
  const paddingHeight = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom)

  // scrollHeight is a padding-box measurement. Convert it to the element's
  // configured box model before assigning an inline CSS height.
  const requiredBorderBoxHeight = Math.max(defaultBoxHeight, editable.scrollHeight + borderHeight)
  return styles.boxSizing === 'border-box'
    ? requiredBorderBoxHeight
    : requiredBorderBoxHeight - borderHeight - paddingHeight
}

function resizeEditable() {
  if (resizeFrame !== undefined)
    cancelAnimationFrame(resizeFrame)

  const defaultHeight = props.defaultHeight ?? 'fit-content'
  editableHeight.value = defaultHeight
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = undefined
    const editable = editableRef.value
    if (!editable)
      return

    if (input.value === '') {
      return
    }

    const defaultBoxHeight = editable.getBoundingClientRect().height
    editableHeight.value = `${getResizedHeight(editable, defaultBoxHeight)}px`
  })
}

function onInput(event: Event) {
  const editable = event.currentTarget
  if (!(editable instanceof HTMLDivElement))
    return

  removeTrailingFillerBreak(editable)
  input.value = readEditableText(editable)
  if (editable.children.length > 0)
    syncEditableValue(true)
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

function onDrop(event: DragEvent) {
  event.preventDefault()
  const transfer = event.dataTransfer
  if (!transfer)
    return

  const files = Array.from(transfer.files)
  if (files.length > 0) {
    events('pasteFile', files)
    return
  }

  const editable = event.currentTarget
  if (!(editable instanceof HTMLDivElement))
    return

  insertPlainText(editable, transfer.getData('text/plain'))
  input.value = readEditableText(editable)
}

function onBeforeInput(event: InputEvent) {
  if (event.inputType === 'insertFromDrop' || event.inputType.startsWith('format'))
    event.preventDefault()
}

function insertPlainText(editable: HTMLDivElement, text: string) {
  editable.focus({ preventScroll: true })

  // NOTICE:
  // Scripted Range mutations do not join the browser undo transaction.
  // execCommand('insertText') inserts plain text and keeps paste undoable.
  // This is required until browsers provide a non-deprecated editing API with
  // the same undo contract.
  if (document.execCommand('insertText', false, text))
    return

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

watch([input, () => props.defaultHeight], () => {
  void nextTick(() => {
    syncEditableValue()
    resizeEditable()
  })
}, { immediate: true })

onUnmounted(() => {
  if (resizeFrame !== undefined)
    cancelAnimationFrame(resizeFrame)
})
</script>

<template>
  <div
    ref="editableRef"
    contenteditable="plaintext-only"
    role="textbox"
    aria-multiline="true"
    :aria-label="props.placeholder"
    :data-placeholder="props.placeholder"
    :data-empty="input === '' ? '' : undefined"
    :style="{ height: editableHeight }"
    :class="[
      'whitespace-pre-wrap break-words',
      'data-[empty]:before:pointer-events-none data-[empty]:before:content-[attr(data-placeholder)]',
    ]"
    @beforeinput="onBeforeInput"
    @drop="onDrop"
    @input="onInput"
    @keydown="onKeyDown"
    @paste="onPaste"
  />
</template>
