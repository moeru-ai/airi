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

function getSelectionOffsets(editable: HTMLDivElement, previousValue: string) {
  const selection = editable.ownerDocument.getSelection()
  if (!selection || editable.ownerDocument.activeElement !== editable)
    return

  const { anchorNode, anchorOffset, focusNode, focusOffset } = selection
  if (!anchorNode || !focusNode || !editable.contains(anchorNode) || !editable.contains(focusNode))
    return

  // Native plaintext editing produces text, br, and div nodes, not rich HTML.
  // Selection serializes their rendered breaks, like innerText. Range.toString only
  // counts text nodes. Sample each prefix without changing the editing DOM,
  // then restore both endpoints before the queued selectionchange is delivered.
  // Clamp the final caret filler to the end of the model's text.
  try {
    selection.setBaseAndExtent(editable, 0, anchorNode, anchorOffset)
    const anchor = Math.min(selection.toString().replaceAll('\r\n', '\n').length, previousValue.length)
    selection.setBaseAndExtent(editable, 0, focusNode, focusOffset)
    const focus = Math.min(selection.toString().replaceAll('\r\n', '\n').length, previousValue.length)
    return { anchor, focus }
  }
  finally {
    selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset)
  }
}

function restoreSelection(editable: HTMLDivElement, previousValue: string, offsets: ReturnType<typeof getSelectionOffsets>) {
  if (!offsets)
    return

  const selection = editable.ownerDocument.getSelection()
  if (!selection)
    return

  const followsPreviousEnd = offsets.anchor === previousValue.length && offsets.focus === previousValue.length
  const anchor = followsPreviousEnd ? input.value.length : Math.min(offsets.anchor, input.value.length)
  const focus = followsPreviousEnd ? input.value.length : Math.min(offsets.focus, input.value.length)
  const textNode = editable.firstChild
  if (textNode?.nodeType === Node.TEXT_NODE)
    selection.setBaseAndExtent(textNode, anchor, textNode, focus)
  else
    selection.collapse(editable, 0)
}

function syncEditableValue() {
  const editable = editableRef.value
  if (!editable || isComposing.value)
    return

  const previousValue = readEditableText(editable)
  if (previousValue === input.value)
    return

  const selectionOffsets = getSelectionOffsets(editable, previousValue)
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
