<script setup lang="ts">
import { nextTick, onUnmounted, ref, shallowRef, watch } from 'vue'

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
const isComposing = shallowRef(false)
let resizeFrame: number | undefined

// The browser owns local edits, selection, and undo. Model echoes must not
// replace its DOM. Only external draft changes use syncEditableValue.

/**
 * Reads plain text without the final line reserved for the browser caret.
 *
 * @example
 * // A native Shift+Enter after "draft" renders "draft\n\n".
 * // readEditableText(editable) => 'draft\n'
 */
function readEditableText(element: HTMLDivElement) {
  // innerText preserves native line breaks, including break-only WebKit drafts.
  // A lone <br> is an empty editor's caret filler; additional breaks are text.
  // eslint-disable-next-line unicorn/prefer-dom-node-text-content
  const text = element.innerText.replaceAll('\r\n', '\n')
  return text.endsWith('\n') ? text.slice(0, -1) : text
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

function syncEditableValue() {
  const editable = editableRef.value
  if (!editable || isComposing.value)
    return

  const previousValue = readEditableText(editable)
  if (previousValue === input.value)
    return

  const selectionOffsets = getSelectionOffsets(editable)
  // A trailing line needs one more newline for the caret. Use the same
  // representation as native editing so readEditableText can omit that filler.
  editable.textContent = input.value.endsWith('\n') ? `${input.value}\n` : input.value
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

/**
 * Triggering workflow:
 * `input` -> {@link onInput} -> draft model via {@link readEditableText}
 */
function onInput(event: Event) {
  const editable = event.currentTarget
  if (!(editable instanceof HTMLDivElement))
    return

  input.value = readEditableText(editable)
}

/**
 * Triggering workflow:
 * `keydown` -> {@link onKeyDown} -> `submit` outside IME composition
 */
function onKeyDown(event: KeyboardEvent) {
  if (!props.submitOnEnter || event.key !== 'Enter' || event.shiftKey || event.isComposing || isComposing.value)
    return

  // NOTICE:
  // Safari can send the IME confirmation key after compositionend.
  // isComposing is false for that key, but keyCode remains 229.
  // Source: https://bugs.webkit.org/show_bug.cgi?id=165004
  // Remove this check when supported Safari versions preserve composition order.
  if (event.keyCode === 229)
    return

  event.preventDefault()
  events('submit', input.value)
}

/**
 * Leaves text insertion and undo to the browser; forwards only attachments.
 *
 * Triggering workflow:
 * `paste` / `drop` -> {@link onTransfer} -> `pasteFile`
 */
function onTransfer(event: ClipboardEvent | DragEvent) {
  const transfer = event instanceof ClipboardEvent ? event.clipboardData : event.dataTransfer
  if (!transfer || transfer.files.length === 0)
    return

  event.preventDefault()
  events('pasteFile', Array.from(transfer.files))
}

watch([input, () => props.defaultHeight, isComposing], () => {
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
    :aria-placeholder="props.placeholder"
    :data-placeholder="props.placeholder"
    :data-empty="input === '' ? '' : undefined"
    :style="{ height: editableHeight }"
    :class="[
      'whitespace-pre-wrap break-words',
      'data-[empty]:before:pointer-events-none data-[empty]:before:content-[attr(data-placeholder)]',
    ]"
    @compositionstart="isComposing = true"
    @compositionend="isComposing = false"
    @drop="onTransfer"
    @input="onInput"
    @keydown="onKeyDown"
    @paste="onTransfer"
  />
</template>
