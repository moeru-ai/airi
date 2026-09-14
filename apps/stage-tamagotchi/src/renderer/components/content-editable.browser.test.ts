import { BasicContentEditable } from '@proj-airi/ui'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { defineComponent, ref } from 'vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

describe('plain-text editor', () => {
  // https://github.com/moeru-ai/airi/pull/2461
  it('leaves the IME confirmation key to the browser', async () => {
    // ROOT CAUSE:
    //
    // The editor prevented every Enter key, including IME confirmation.
    // A parent could ignore submission, but could not undo preventDefault.
    // The editor must leave composition keys to the browser.
    const submit = vi.fn()
    const screen = await render(BasicContentEditable, { props: { onSubmit: submit } })
    const input = screen.getByRole('textbox').element()
    const confirmation = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      isComposing: true,
      bubbles: true,
      cancelable: true,
    })

    input.dispatchEvent(confirmation)

    expect(confirmation.defaultPrevented).toBe(false)
    expect(submit).not.toHaveBeenCalled()
  })

  // https://bugs.webkit.org/show_bug.cgi?id=165004
  it('leaves Safari confirmation Enter alone after compositionend', async () => {
    // ROOT CAUSE:
    //
    // Safari can emit compositionend before the confirmation keydown.
    // isComposing is then false. The IME key code still identifies that key.
    const submit = vi.fn()
    const screen = await render(BasicContentEditable, { props: { onSubmit: submit } })
    const input = screen.getByRole('textbox').element()
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    const confirmation = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 229,
      bubbles: true,
      cancelable: true,
    })

    input.dispatchEvent(confirmation)

    expect(confirmation.defaultPrevented).toBe(false)
    expect(submit).not.toHaveBeenCalled()
  })

  it('submits Enter by its meaning, including the numeric keypad', async () => {
    const submit = vi.fn()
    const screen = await render(BasicContentEditable, {
      props: { modelValue: 'draft', onSubmit: submit },
    })
    const input = screen.getByRole('textbox').element()
    const enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'NumpadEnter',
      bubbles: true,
      cancelable: true,
    })

    input.dispatchEvent(enter)

    expect(enter.defaultPrevented).toBe(true)
    expect(submit).toHaveBeenCalledWith('draft')
  })

  // https://github.com/moeru-ai/airi/pull/2461
  it('keeps native multiline edits and undo in sync with the draft', async () => {
    // ROOT CAUSE:
    //
    // Replacing browser-created line breaks after input invalidated the
    // browser selection and undo history. Read the draft without rewriting
    // the DOM that belongs to the current editing transaction.
    const update = vi.fn()
    const screen = await render(BasicContentEditable, {
      props: { 'onUpdate:modelValue': update },
    })
    const input = screen.getByRole('textbox')
    await userEvent.fill(input, 'draft')
    await userEvent.click(input)
    await userEvent.keyboard('{End}{Shift>}{Enter}{/Shift}next')

    await vi.waitFor(() => expect(update).toHaveBeenLastCalledWith('draft\nnext'))
    await userEvent.keyboard('{ControlOrMeta>}z{/ControlOrMeta}')

    await vi.waitFor(() => expect(update).not.toHaveBeenLastCalledWith('draft\nnext'))
    await userEvent.keyboard('{ControlOrMeta>}{Shift>}z{/Shift}{/ControlOrMeta}')

    await vi.waitFor(() => expect(update).toHaveBeenLastCalledWith('draft\nnext'))
  })

  // https://github.com/moeru-ai/airi/pull/2461
  it('does not submit the browser caret filler as an extra newline', async () => {
    const submit = vi.fn()
    const screen = await render(BasicContentEditable, {
      props: { modelValue: 'draft', onSubmit: submit },
    })
    await userEvent.click(screen.getByRole('textbox'))
    await userEvent.keyboard('{End}{Shift>}{Enter}{/Shift}{Enter}')

    expect(submit).toHaveBeenCalledWith('draft\n')
  })

  // https://github.com/moeru-ai/airi/pull/2461#discussion_r4002754625
  it('preserves break-only drafts for Issue #2461', async () => {
    // ROOT CAUSE:
    //
    // WebKit represents an empty line and its caret filler with two br nodes.
    // textContent is empty for both nodes, so the early return discarded the
    // draft. Read rendered line breaks before removing the final caret filler.
    const update = vi.fn()
    const screen = await render(BasicContentEditable, {
      props: { 'defaultHeight': '32px', 'placeholder': 'Write a message', 'onUpdate:modelValue': update },
      attrs: { style: 'line-height: 24px; overflow-y: auto' },
    })
    const input = screen.getByRole('textbox').element()
    const emptyHeight = input.getBoundingClientRect().height

    input.innerHTML = '<br><br>'
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertLineBreak' }))

    await vi.waitFor(() => expect(update).toHaveBeenLastCalledWith('\n'))
    await expect.element(input).not.toHaveAttribute('data-empty')

    input.innerHTML = '<br><br><br>'
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertLineBreak' }))
    await vi.waitFor(() => expect(update).toHaveBeenLastCalledWith('\n\n'))

    input.innerHTML = '<br>'
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }))
    await vi.waitFor(() => expect(update).toHaveBeenLastCalledWith(''))
    await expect.element(input).toHaveAttribute('data-empty', '')
    await expect.poll(() => input.getBoundingClientRect().height).toBe(emptyHeight)

    // Check native blank-line growth in the mobile composer's scrollable layout.
    await userEvent.fill(screen.getByRole('textbox'), '')
    await userEvent.keyboard('{Shift>}{Enter}{Enter}{/Shift}')
    await vi.waitFor(() => expect(update).toHaveBeenLastCalledWith('\n\n'))
    await expect.poll(() => input.getBoundingClientRect().height).toBeGreaterThan(emptyHeight)
  })

  it('preserves consecutive blank lines in the submitted text', async () => {
    const submit = vi.fn()
    const screen = await render(BasicContentEditable, {
      props: { modelValue: 'draft', onSubmit: submit },
    })
    await userEvent.click(screen.getByRole('textbox'))
    await userEvent.keyboard('{End}{Shift>}{Enter}{Enter}{/Shift}next{Enter}')

    expect(submit).toHaveBeenCalledWith('draft\n\nnext')
  })

  it('keeps a controlled draft and its trailing newline stable', async () => {
    const screen = await render(defineComponent({
      components: { BasicContentEditable },
      setup() {
        const draft = ref('draft\n')
        return { draft }
      },
      template: '<BasicContentEditable v-model="draft" /><output>{{ JSON.stringify(draft) }}</output><button @click="draft = \'\';">Clear draft</button>',
    }))
    const input = screen.getByRole('textbox')
    await userEvent.click(input)
    await userEvent.keyboard('{ControlOrMeta>}{End}{/ControlOrMeta}next')

    await expect.element(screen.getByRole('status')).toHaveTextContent(JSON.stringify('draft\nnext'))
    await userEvent.click(screen.getByRole('button', { name: 'Clear draft' }))
    await expect.element(input).toHaveTextContent('')
    await expect.element(input).toHaveAttribute('data-empty', '')
  })

  // https://github.com/moeru-ai/airi/pull/2461#discussion_r4003137131
  it.each([
    ['breaks', 'first<br>second', 'first\nsecond'],
    ['blocks', '<div>first</div><div>second</div>', 'first\nsecond'],
    ['surrogate pairs', '😀<br>second', '😀\nsecond'],
    ['blank lines', 'first<br><br>second', 'first\n\nsecond'],
  ])('preserves multiline selection through external updates with %s for Issue #2461', async (_, html, text) => {
    // ROOT CAUSE:
    // Range.toString omits rendered separators. Its offsets did not address
    // the same plain text that replaces the DOM during an external update.
    const draft = ref(text)
    const screen = await render(defineComponent({
      components: { BasicContentEditable },
      setup: () => ({ draft }),
      template: '<BasicContentEditable v-model="draft" />',
    }))
    const input = screen.getByRole('textbox').element()
    input.innerHTML = html
    input.focus()
    const lastText = input.lastChild instanceof Text ? input.lastChild : input.lastChild!.firstChild!
    const selection = window.getSelection()!
    selection.setBaseAndExtent(lastText, 4, lastText, 1)

    draft.value = `${text}!`

    await expect.poll(() => input.textContent).toBe(`${text}!`)
    expect(selection.anchorOffset).toBe(text.indexOf('second') + 4)
    expect(selection.focusOffset).toBe(text.indexOf('second') + 1)
    expect(selection.toString()).toBe('eco')
  })

  // https://github.com/moeru-ai/airi/pull/2461#discussion_r4003137131
  it.each([
    ['first<br>second', 'first\nsecond'],
    ['first<br><br>', 'first\n'],
    ['<br><br><br>', '\n\n'],
  ])('keeps the end caret following external appends from %s for Issue #2461', async (html, text) => {
    const draft = ref(text)
    const screen = await render(defineComponent({
      components: { BasicContentEditable },
      setup: () => ({ draft }),
      template: '<BasicContentEditable v-model="draft" />',
    }))
    const input = screen.getByRole('textbox').element()
    input.innerHTML = html
    input.focus()
    const selection = window.getSelection()!
    selection.collapse(input, input.childNodes.length)
    draft.value += ' appended'

    await expect.poll(() => input.textContent).toBe(draft.value)
    expect(selection.anchorOffset).toBe(draft.value.length)
    expect(selection.isCollapsed).toBe(true)
  })

  it('does not reclaim focus when an external update replaces a blurred draft', async () => {
    const draft = ref('draft')
    const screen = await render(defineComponent({
      components: { BasicContentEditable },
      setup: () => ({ draft }),
      template: '<BasicContentEditable v-model="draft" /><button>Next control</button>',
    }))
    const input = screen.getByRole('textbox')
    const button = screen.getByRole('button')
    await userEvent.click(input)
    button.element().focus()
    await expect.element(button).toHaveFocus()
    draft.value = 'external draft'

    await expect.element(input).toHaveTextContent('external draft')
    await expect.element(button).toHaveFocus()
  })

  it('lets native paste strip formatting and remain undoable', async () => {
    const screen = await render(defineComponent({
      components: { BasicContentEditable },
      template: '<div contenteditable="true" role="textbox" aria-label="Copy source"><strong>bold</strong> text</div><BasicContentEditable placeholder="Paste target" />',
    }))
    const source = screen.getByRole('textbox', { name: 'Copy source' })
    const target = screen.getByRole('textbox', { name: 'Paste target' })
    await userEvent.click(source)
    await userEvent.keyboard('{ControlOrMeta>}a{/ControlOrMeta}')
    await userEvent.copy()
    await userEvent.click(target)
    await userEvent.paste()

    await expect.element(target).toHaveTextContent('bold text')
    expect(target.element().querySelector('strong')).toBeNull()
    await userEvent.keyboard('{ControlOrMeta>}z{/ControlOrMeta}')
    await expect.element(target).toHaveTextContent('')
  })

  it('forwards pasted and dropped files without inserting them into the editor', async () => {
    const pasteFile = vi.fn()
    const screen = await render(BasicContentEditable, { props: { onPasteFile: pasteFile } })
    const input = screen.getByRole('textbox').element()
    const file = new File(['image'], 'image.png', { type: 'image/png' })
    const transfer = new DataTransfer()
    transfer.items.add(file)
    const paste = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true })
    const drop = new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true })

    input.dispatchEvent(paste)
    input.dispatchEvent(drop)

    expect(paste.defaultPrevented).toBe(true)
    expect(drop.defaultPrevented).toBe(true)
    expect(pasteFile).toHaveBeenNthCalledWith(1, [file])
    expect(pasteFile).toHaveBeenNthCalledWith(2, [file])
    expect(input.textContent).toBe('')
  })

  it('has an accessible name and remains a keyboard focus target', async () => {
    const screen = await render(BasicContentEditable, {
      props: { placeholder: 'Write a message' },
    })
    const input = screen.getByRole('textbox', { name: 'Write a message' })
    await userEvent.tab()

    await expect.element(input).toHaveFocus()
    await expect.element(input).toHaveAttribute('aria-multiline', 'true')
    await expect.element(input).toHaveAttribute('contenteditable', 'plaintext-only')
  })
})
