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
