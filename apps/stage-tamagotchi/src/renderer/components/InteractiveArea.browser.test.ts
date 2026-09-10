import type { AuthorizationHandler } from '@proj-airi/stage-ui/libs/auth'
import type { ChatSessionMeta } from '@proj-airi/stage-ui/types/chat-session'
import type { Component } from 'vue'

import SharedInteractiveArea from '@proj-airi/stage-layouts/components/Layouts/InteractiveArea'
import MobileInteractiveArea from '@proj-airi/stage-layouts/components/Layouts/MobileInteractiveArea'

import { PiniaColada } from '@pinia/colada'
import { useThreeViewControl } from '@proj-airi/stage-ui-three'
import { browserAuthorizationHandler, registerAuthorizationHandler } from '@proj-airi/stage-ui/libs/auth'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useChatStreamStore } from '@proj-airi/stage-ui/stores/chat/stream-store'
import { useL2dViewControl } from '@proj-airi/stage-ui/stores/live2d'
import { useSettingsStageModel } from '@proj-airi/stage-ui/stores/settings/stage-model'
import { createPinia, disposePinia } from 'pinia'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import InteractiveArea from './InteractiveArea.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
  })
}

async function renderArea(component: Component = InteractiveArea) {
  useL2dViewControl().viewControlsEnabled.value = false
  useThreeViewControl().viewControlsEnabled.value = false
  const sessionB: ChatSessionMeta = {
    sessionId: 'session-b',
    userId: 'local',
    characterId: 'default',
    createdAt: 1,
    updatedAt: 1,
  }
  const sessionA: ChatSessionMeta = {
    ...sessionB,
    sessionId: 'session-a',
    createdAt: 2,
    updatedAt: 2,
  }
  const pinia = createPinia()
  onTestFinished(() => disposePinia(pinia))
  pinia.state.value = {
    'chat-session-selection': { activeSessionId: 'session-b' },
    'chat-session': {
      sessionMetas: { 'session-a': sessionA, 'session-b': sessionB },
      sessionMessages: {
        'session-a': [{ id: 'system-a', role: 'system', content: 'session A prompt' }],
        'session-b': [{ id: 'system', role: 'system', content: 'system prompt' }],
      },
    },
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  await router.push('/')
  await router.isReady()

  // These surfaces fill an app window. An auto-sized host lets percentage heights
  // depend on the composer that ResizeObserver is measuring.
  const container = document.createElement('div')
  container.style.cssText = 'position: relative; width: 100vw; height: 100vh;'
  document.body.appendChild(container)
  onTestFinished(() => container.remove())

  const screen = await render(component, {
    container,
    baseElement: document.body,
    global: { plugins: [pinia, PiniaColada, createTestI18n(), router] },
  })
  onTestFinished(() => screen.unmount())
  await expect.element(screen.getByRole('textbox')).toBeVisible()

  return {
    chat: useChatStore(pinia),
    chatSession: useChatSessionStore(pinia),
    chatStream: useChatStreamStore(pinia),
    stageModel: useSettingsStageModel(pinia),
    screen,
  }
}

async function submitDraft(screen: Awaited<ReturnType<typeof renderArea>>['screen'], draft: string) {
  const input = screen.getByRole('textbox')
  await userEvent.fill(input, draft)
  await userEvent.click(input)
  await userEvent.keyboard('{Enter}')
  return input
}

async function attachImages(screen: Awaited<ReturnType<typeof renderArea>>['screen'], count: number) {
  const input = screen.container.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input)
    throw new Error('Expected the chat image input.')

  const transfer = new DataTransfer()
  for (let index = 0; index < count; index++) {
    transfer.items.add(new File([`image-${index}`], `image-${index}.png`, { type: 'image/png' }))
  }

  input.files = transfer.files
  input.dispatchEvent(new Event('change', { bubbles: true }))

  await vi.waitFor(() => {
    expect(screen.container.querySelectorAll('img[src^="blob:"]')).toHaveLength(count)
  })
}

function dispatchHorizontalPan(element: HTMLElement, deltaX = 60) {
  element.dispatchEvent(new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaX,
    deltaY: 2,
  }))
}

async function expectElectronReplyBubble(screen: Awaited<ReturnType<typeof renderArea>>['screen']) {
  await vi.waitFor(() => {
    expect(screen.container.querySelector('[data-swipeable]')).not.toBeNull()
  })

  const input = screen.getByRole('textbox').element() as HTMLTextAreaElement
  const bubble = input.parentElement
  const swipeSurface = screen.container.querySelector<HTMLElement>('[data-swipeable]')
  expect(bubble).not.toBeNull()
  expect(swipeSurface).not.toBeNull()
  if (!bubble || !swipeSurface)
    throw new Error('Expected the message input bubble and a swipe surface.')

  const collapsedHeight = bubble.getBoundingClientRect().height
  dispatchHorizontalPan(swipeSurface)

  await vi.waitFor(() => {
    const cancelButton = bubble.querySelector<HTMLButtonElement>('[aria-label="stage.chat.reply.cancel"]')
    expect(cancelButton?.parentElement?.getAttribute('aria-hidden')).toBe('false')
    expect(bubble.getBoundingClientRect().height).toBeGreaterThan(collapsedHeight)
  })

  expect(getComputedStyle(input).backgroundColor).toBe('rgba(0, 0, 0, 0)')
  expect(getComputedStyle(bubble).backgroundColor).not.toBe('rgba(0, 0, 0, 0)')

  const cancelButton = bubble.querySelector<HTMLButtonElement>('[aria-label="stage.chat.reply.cancel"]')
  const replyTransition = cancelButton?.parentElement?.parentElement
  expect(replyTransition).not.toBeNull()
  expect(cancelButton).not.toBeNull()
  if (!replyTransition || !cancelButton)
    throw new Error('Expected the reply transition and cancel button.')

  expect(Number.parseFloat(getComputedStyle(replyTransition).transitionDuration)).toBeGreaterThan(0)
  const expandedHeight = bubble.getBoundingClientRect().height
  cancelButton.click()
  await nextTick()
  expect(cancelButton.parentElement?.getAttribute('aria-hidden')).toBe('true')
  expect(bubble.getBoundingClientRect().height).toBeGreaterThan(collapsedHeight)
  expect(bubble.getBoundingClientRect().height).toBeCloseTo(expandedHeight, 0)
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(bubble.getBoundingClientRect().height).toBeGreaterThan(collapsedHeight)
  expect(bubble.getBoundingClientRect().height).toBeLessThan(expandedHeight)
  await vi.waitFor(() => {
    expect(bubble.getBoundingClientRect().height).toBeCloseTo(collapsedHeight, 0)
  })
}

describe('interactive area synchronized state', () => {
  beforeEach(async () => {
    await page.viewport(1280, 720)
  })

  it('opens mobile settings from an icon-only header and restores focus', async () => {
    await page.viewport(390, 844)
    const { screen } = await renderArea(MobileInteractiveArea)
    const trigger = screen.getByRole('button', { name: 'stage.mobile-tools.title', exact: true })
    const bounds = trigger.element().getBoundingClientRect()
    expect(bounds.width).toBeGreaterThanOrEqual(44)
    expect(bounds.height).toBeGreaterThanOrEqual(44)
    expect(bounds.right).toBeLessThanOrEqual(390)
    expect(bounds.left).toBeGreaterThan(300)
    expect(bounds.top).toBeLessThan(40)
    expect(trigger.element().textContent?.trim()).toBe('')
    await expect.element(screen.getByTestId('speech-mute-button')).not.toBeInTheDocument()

    await trigger.click()
    await expect.element(screen.getByRole('dialog', { name: 'stage.mobile-tools.title' })).toBeVisible()
    await expect.element(screen.getByText('stage.mobile-tools.sign-in', { exact: true })).toBeVisible()
    const account = screen.getByRole('button', { name: 'stage.mobile-tools.sign-in stage.mobile-tools.account-description' }).element()
    const drawerTitle = screen.getByRole('heading', { name: 'stage.mobile-tools.title' }).element()
    const accountContent = account.querySelector<HTMLElement>('.basic-button-content')
    // ROOT CAUSE:
    //
    // The account row relied on scoped descendant CSS to stretch
    // BasicButton's content wrapper. The combined browser bundle could leave
    // that wrapper at its content width, centering the label inward. Comparing
    // text coordinates was also unstable while the drawer portal animated, so
    // assert the owned row and content geometry directly.
    expect(accountContent).not.toBeNull()
    await expect.poll(() => getComputedStyle(account).paddingLeft).toBe('0px')
    expect(account.getBoundingClientRect().left).toBe(drawerTitle.getBoundingClientRect().left)
    expect(accountContent!.getBoundingClientRect().width).toBe(account.clientWidth)
    expect(account.getBoundingClientRect().height).toBe(56)
    expect(account.querySelector('[data-avatar-fallback], [data-avatar-image]')).toBeNull()
    await expect.element(screen.getByText('stage.mobile-tools.cleanup', { exact: true })).not.toBeInTheDocument()
    await expect.element(screen.getByRole('switch', { name: 'stage.mobile-tools.character-voice' })).toBeVisible()
    const voice = screen.getByRole('switch', { name: 'stage.mobile-tools.character-voice' })
    const before = voice.element().getAttribute('aria-checked')
    await voice.click()
    await expect.element(voice).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true')
    await expect.element(screen.getByRole('button', { name: 'Close', exact: true })).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await expect.element(trigger).toHaveFocus()
  })

  it('removes the clear-messages action from desktop chat surfaces', async () => {
    for (const component of [InteractiveArea, SharedInteractiveArea]) {
      const { screen } = await renderArea(component)
      expect(screen.container.querySelector('[class*="trash-bin-2-bold-duotone"]')).toBeNull()
      screen.unmount()
    }
  })

  it('places the conversation selector opposite settings in the mobile header', async () => {
    await page.viewport(390, 844)
    const { screen } = await renderArea(MobileInteractiveArea)
    const composer = screen.getByTestId('mobile-message-composer').element()
    const conversations = screen.getByTestId('conversation-selector-button').element()
    const bounds = conversations.getBoundingClientRect()
    const settingsBounds = screen.getByTestId('mobile-settings-button').element().getBoundingClientRect()
    expect(composer.contains(conversations)).toBe(false)
    expect(bounds.left).toBe(12)
    expect(bounds.top).toBe(settingsBounds.top)
    expect(bounds.width).toBe(44)
    expect(bounds.height).toBe(44)
    expect(bounds.left).toBe(390 - settingsBounds.right)
    expect(conversations.textContent?.trim()).toBe('')
    await screen.getByTestId('conversation-selector-button').click()
    await expect.element(screen.getByRole('dialog')).toBeVisible()
  })

  it('uses the full mobile width for chat history after removing the action rail', async () => {
    // ROOT CAUSE:
    //
    // The removed right action rail left a fixed 3.5rem reservation on the
    // chat history. Long messages and the scrollbar still stopped before the
    // right edge even though the controls no longer occupied that space.
    await page.viewport(390, 844)
    const { screen } = await renderArea(MobileInteractiveArea)
    const history = screen.container.querySelector<HTMLElement>('.chat-history')

    expect(history).not.toBeNull()
    expect(history!.getBoundingClientRect().width).toBe(390)
  })

  it('opens view controls on the stage and closes them from the top right', async () => {
    await page.viewport(390, 844)
    const viewControl = useL2dViewControl()
    viewControl.viewControlsEnabled.value = false

    const { screen, stageModel } = await renderArea(MobileInteractiveArea)
    stageModel.setStageModelRenderer('live2d')

    await screen.getByTestId('mobile-settings-button').click()
    await screen.getByRole('button', { name: 'stage.mobile-tools.view', exact: true }).click()

    await expect.element(screen.getByRole('dialog', { name: 'stage.mobile-tools.title' })).not.toBeInTheDocument()
    await expect.element(screen.getByTestId('mobile-message-composer')).not.toBeVisible()
    await expect.element(screen.getByTestId('conversation-selector-button')).not.toBeInTheDocument()
    await expect.element(screen.getByRole('button', { name: 'X', exact: true })).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Y', exact: true })).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Scale', exact: true })).toBeVisible()

    const close = screen.getByTestId('view-controls-close-button').element()
    // ROOT CAUSE:
    //
    // The drawer suppressed focus restoration before emitting the mode change,
    // but the Stage did not move focus into the newly rendered controls.
    await expect.element(screen.getByTestId('view-controls-close-button')).toHaveFocus()
    expect(close.getBoundingClientRect().right).toBe(378)
    expect(close.getBoundingClientRect().top).toBe(12)
    const toolbar = screen.getByTestId('view-controls-toolbar').element()
    // ROOT CAUSE:
    //
    // Fixed horizontal padding ignored display cutouts in landscape viewports.
    // The toolbar now uses the same left and right safe-area minimum as the header.
    expect(toolbar.classList).toContain('pl-[max(0.75rem,env(safe-area-inset-left))]')
    expect(toolbar.classList).toContain('pr-[max(0.75rem,env(safe-area-inset-right))]')

    await screen.getByRole('button', { name: 'stage.mobile-tools.close-view', exact: true }).click()

    await expect.element(screen.getByTestId('mobile-message-composer')).toBeVisible()
    await expect.element(screen.getByTestId('conversation-selector-button')).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'X', exact: true })).not.toBeInTheDocument()
    // ROOT CAUSE:
    //
    // Closing view mode removed its focused header without moving focus to the
    // newly mounted normal header, so keyboard users fell back to the document body.
    await expect.element(screen.getByTestId('mobile-settings-button')).toHaveFocus()
    expect(viewControl.viewControlsEnabled.value).toBe(false)
  })

  it('keeps a docked input bubble mounted while view controls are open', async () => {
    // ROOT CAUSE:
    //
    // Entering view mode removed the composer subtree. Its dock animation stores
    // opacity and position on the mounted elements, while the docked state survives.
    // Recreating the subtree therefore lost the visual state when view mode closed.
    await page.viewport(390, 844)
    const { screen, stageModel } = await renderArea(MobileInteractiveArea)
    stageModel.setStageModelRenderer('live2d')
    const bubble = screen.getByTestId('mobile-input-bubble').element()
    const input = screen.getByRole('textbox').element()
    const icon = bubble.querySelector<HTMLElement>('[aria-hidden="true"]')!
    const bounds = bubble.getBoundingClientRect()
    const pointer = {
      bubbles: true,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
      isPrimary: true,
      pointerId: 1,
      pointerType: 'touch',
    }
    vi.spyOn(bubble, 'setPointerCapture').mockImplementation(() => {})

    bubble.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, button: 0, buttons: 1 }))
    await new Promise(resolve => setTimeout(resolve, 550))
    bubble.dispatchEvent(new PointerEvent('pointermove', { ...pointer, buttons: 1, clientY: pointer.clientY - 80 }))
    bubble.dispatchEvent(new PointerEvent('pointerup', { ...pointer, buttons: 0, clientY: pointer.clientY - 80 }))
    await expect.poll(() => getComputedStyle(input).opacity).toBe('0')
    expect(getComputedStyle(icon).opacity).toBe('1')

    await screen.getByTestId('mobile-settings-button').click()
    await screen.getByRole('button', { name: 'stage.mobile-tools.view', exact: true }).click()

    expect(bubble.isConnected).toBe(true)
    await expect.element(screen.getByTestId('mobile-message-composer')).not.toBeVisible()

    await screen.getByTestId('view-controls-close-button').click()

    expect(screen.getByTestId('mobile-input-bubble').element()).toBe(bubble)
    expect(getComputedStyle(input).opacity).toBe('0')
    expect(getComputedStyle(icon).opacity).toBe('1')
  })

  it('closes view controls with Escape and restores focus', async () => {
    // ROOT CAUSE:
    //
    // Moving view controls out of the dismissible drawer removed its Escape
    // behavior, leaving keyboard users in the focused Stage mode.
    await page.viewport(390, 844)
    const { screen, stageModel } = await renderArea(MobileInteractiveArea)
    stageModel.setStageModelRenderer('live2d')

    await screen.getByTestId('mobile-settings-button').click()
    await screen.getByRole('button', { name: 'stage.mobile-tools.view', exact: true }).click()
    await expect.element(screen.getByTestId('view-controls-close-button')).toHaveFocus()
    await userEvent.keyboard('{Escape}')

    await expect.element(screen.getByTestId('mobile-message-composer')).toBeVisible()
    await expect.element(screen.getByTestId('view-controls-close-button')).not.toBeInTheDocument()
    await expect.element(screen.getByTestId('mobile-settings-button')).toHaveFocus()
  })

  it('exits view controls when the active renderer changes', async () => {
    // ROOT CAUSE:
    //
    // Mobile view mode combined both renderer flags. After a renderer switch,
    // the previous flag kept the chat hidden while the new renderer had no controls.
    // The active renderer now owns the visible mode, and transitions clear stale flags.
    await page.viewport(390, 844)
    const live2dViewControl = useL2dViewControl()
    const threeViewControl = useThreeViewControl()
    const { screen, stageModel } = await renderArea(MobileInteractiveArea)
    stageModel.setStageModelRenderer('live2d')

    await screen.getByTestId('mobile-settings-button').click()
    await screen.getByRole('button', { name: 'stage.mobile-tools.view', exact: true }).click()
    await expect.element(screen.getByTestId('view-controls-close-button')).toBeVisible()

    stageModel.setStageModelRenderer('vrm')

    await expect.element(screen.getByTestId('mobile-message-composer')).toBeVisible()
    await expect.element(screen.getByTestId('view-controls-close-button')).not.toBeInTheDocument()
    expect(live2dViewControl.viewControlsEnabled.value).toBe(false)
    expect(threeViewControl.viewControlsEnabled.value).toBe(false)
    await expect.element(screen.getByTestId('mobile-settings-button')).toHaveFocus()
  })

  it('shows all five mobile view controls for VRM models', async () => {
    await page.viewport(390, 844)
    const { screen, stageModel } = await renderArea(MobileInteractiveArea)
    stageModel.setStageModelRenderer('vrm')

    await screen.getByTestId('mobile-settings-button').click()
    await screen.getByRole('button', { name: 'stage.mobile-tools.view', exact: true }).click()

    await expect.element(screen.getByRole('button', { name: 'X', exact: true })).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Y', exact: true })).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Z', exact: true })).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Dis', exact: true })).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'FOV', exact: true })).toBeVisible()

    await screen.getByTestId('view-controls-close-button').click()
  })

  it('keeps the empty mobile input compact and aligns the send action with its bubble', async () => {
    // ROOT CAUSE:
    //
    // The hierarchy redesign removed the input bubble's compact maximum width.
    // The 40px bubble also top-aligned its 32px textarea while the send action
    // aligned to the bottom of the same row. The reply container now owns the
    // visible border, so the action aligns with the bubble instead of its inset textarea.
    await page.viewport(390, 844)
    const { screen } = await renderArea(MobileInteractiveArea)
    const composer = screen.getByTestId('mobile-message-composer').element()
    const bubble = screen.getByTestId('mobile-input-bubble').element()
    const input = screen.getByRole('textbox').element()
    const composerStyle = getComputedStyle(composer)
    const composerContentWidth = composer.clientWidth
      - Number.parseFloat(composerStyle.paddingLeft)
      - Number.parseFloat(composerStyle.paddingRight)

    expect(Math.round(bubble.getBoundingClientRect().width)).toBe(Math.round(composerContentWidth * 0.7))

    await userEvent.fill(input, 'hi')
    const send = screen.getByRole('button', { name: 'stage.chat.actions.send' }).element()
    await expect.poll(() => input.getBoundingClientRect().height).toBe(32)
    expect(send.getBoundingClientRect().height).toBe(32)
    expect(bubble.getBoundingClientRect().bottom).toBe(send.getBoundingClientRect().bottom)
    expect(input.getBoundingClientRect().bottom).toBe(
      bubble.getBoundingClientRect().bottom - Number.parseFloat(getComputedStyle(bubble).borderBottomWidth),
    )
  })

  it('closes mobile settings before requesting sign-in', async () => {
    let openDialogAtSignIn = true
    const authorize = vi.fn<AuthorizationHandler>(async () => {
      openDialogAtSignIn = document.querySelector('[role="dialog"][data-state="open"]') !== null
    })
    registerAuthorizationHandler(authorize)
    try {
      const { screen } = await renderArea(MobileInteractiveArea)
      await screen.getByTestId('mobile-settings-button').click()
      await screen.getByRole('button', { name: 'stage.mobile-tools.sign-in stage.mobile-tools.account-description' }).click()
      await expect.poll(() => authorize.mock.calls.length).toBe(1)
      expect(openDialogAtSignIn).toBe(false)
      await expect.element(screen.getByRole('dialog', { name: 'stage.mobile-tools.title' })).not.toBeInTheDocument()
    }
    finally {
      registerAuthorizationHandler(browserAuthorizationHandler)
    }
  })

  it('returns from hearing to mobile settings without stacked dialogs', async () => {
    const { screen } = await renderArea(MobileInteractiveArea)
    await screen.getByTestId('mobile-settings-button').click()
    await screen.getByRole('button', { name: 'stage.mobile-tools.hearing' }).click()
    await expect.element(screen.getByRole('dialog', { name: 'stage.mobile-tools.hearing' })).toBeVisible()
    await expect.element(screen.getByRole('dialog', { name: 'stage.mobile-tools.title' })).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await expect.element(screen.getByRole('dialog', { name: 'stage.mobile-tools.title' })).toBeVisible()
    await expect.element(screen.getByRole('dialog', { name: 'stage.mobile-tools.hearing' })).not.toBeInTheDocument()
  })

  it('expands the Electron input bubble around a reply preview', async () => {
    const { chatSession, screen } = await renderArea()
    chatSession.$patch((state) => {
      state.sessionMessages['session-b'] = [{ id: 'reply-target', role: 'user', content: 'Reply target' }]
    })

    await expectElectronReplyBubble(screen)
  })

  // https://github.com/moeru-ai/airi/pull/2489#discussion_r3966523188
  // ROOT CAUSE:
  //
  // Clearing a reply hid the still-mounted preview without moving focus from
  // its cancel button. Keyboard focus then remained in an aria-hidden subtree.
  //
  // Each composer owner now clears the reply and restores focus to its input.
  it('restores composer focus after a keyboard user cancels a reply', async () => {
    const { chatSession, screen } = await renderArea()
    chatSession.$patch((state) => {
      state.sessionMessages['session-b'] = [{ id: 'reply-target', role: 'user', content: 'Reply target' }]
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-swipeable]')).not.toBeNull()
    })
    const swipeable = screen.container.querySelector<HTMLElement>('[data-swipeable]')
    if (!swipeable)
      throw new Error('Expected a swipeable message.')

    dispatchHorizontalPan(swipeable)
    await vi.waitFor(() => {
      const button = screen.container.querySelector<HTMLButtonElement>('[aria-label="stage.chat.reply.cancel"]')
      expect(button?.parentElement?.getAttribute('aria-hidden')).toBe('false')
    })
    const cancelButton = screen.container.querySelector<HTMLButtonElement>('[aria-label="stage.chat.reply.cancel"]')
    if (!cancelButton)
      throw new Error('Expected a reply cancel button.')
    cancelButton.focus()
    expect(document.activeElement).toBe(cancelButton)

    await userEvent.keyboard('{Enter}')

    await expect.element(screen.getByRole('textbox')).toHaveFocus()
    expect(cancelButton.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('sends the Electron reply as a native message relation', async () => {
    const { chat, chatSession, screen } = await renderArea()
    chatSession.$patch((state) => {
      state.sessionMessages['session-b'] = [{ id: 'reply-target', role: 'user', content: 'Reply target' }]
    })
    const send = vi.spyOn(chat, 'send').mockResolvedValueOnce({ messages: [], sessionId: 'session-b' })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-swipeable]')).not.toBeNull()
    })
    const swipeRoot = screen.container.querySelector<HTMLElement>('[data-swipeable]')
    if (!swipeRoot)
      throw new Error('Expected a message swipe root.')

    dispatchHorizontalPan(swipeRoot)
    await vi.waitFor(() => {
      const cancelButton = screen.container.querySelector<HTMLButtonElement>('[aria-label="stage.chat.reply.cancel"]')
      expect(cancelButton?.parentElement?.getAttribute('aria-hidden')).toBe('false')
    })
    await submitDraft(screen, 'My answer')

    await vi.waitFor(() => {
      expect(send).toHaveBeenCalledWith(expect.objectContaining({
        sessionId: 'session-b',
        text: 'My answer',
        replyToMessageId: 'reply-target',
      }))
    })
  })

  // https://github.com/moeru-ai/airi/pull/2399
  it('keeps the input visible when a short window contains many attachments', async () => {
    // ROOT CAUSE:
    //
    // The composer used its full intrinsic height in the fixed chat grid.
    // Multiple attachment rows could exceed the window height, which moved
    // the input below the clipped grid boundary.
    const { screen } = await renderArea()
    const layout = screen.getByTestId('chat-viewport-layout').element() as HTMLElement
    layout.style.height = '240px'
    layout.style.width = '320px'

    await attachImages(screen, 12)

    const input = screen.getByRole('textbox').element() as HTMLTextAreaElement
    const layoutRect = layout.getBoundingClientRect()
    const inputRect = input.getBoundingClientRect()

    expect(inputRect.top).toBeGreaterThanOrEqual(layoutRect.top)
    expect(inputRect.bottom).toBeLessThanOrEqual(layoutRect.bottom)
  })

  // https://github.com/moeru-ai/airi/pull/2399
  it('connects the production history viewport to the fixed composer', async () => {
    // ROOT CAUSE:
    //
    // Isolated layout tests used hand-built history and scrollbar elements.
    // Those tests could pass after the production history stopped using the
    // Reka viewport or moved the composer into the scroll owner.
    const { chatSession, screen } = await renderArea()
    const layout = screen.getByTestId('chat-viewport-layout').element() as HTMLElement
    layout.style.height = '320px'
    layout.style.width = '320px'

    chatSession.$patch((state) => {
      state.sessionMessages['session-b'] = Array.from({ length: 100 }, (_, index) => ({
        id: `message-${index}`,
        role: 'user',
        content: `Message ${index}`,
        createdAt: index,
      }))
    })

    const viewport = screen.container.querySelector<HTMLElement>('.chat-history-list')
    const composer = screen.getByTestId('chat-composer-layer').element() as HTMLElement
    const input = screen.getByRole('textbox').element() as HTMLTextAreaElement
    expect(viewport).not.toBeNull()
    if (!viewport)
      throw new Error('Expected the production chat history viewport.')

    await vi.waitFor(() => {
      expect(viewport.matches('[data-reka-scroll-area-viewport]')).toBe(true)
      expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight)
    })

    expect(composer.contains(input)).toBe(true)
    const composerTop = composer.getBoundingClientRect().top
    viewport.scrollTop = 120
    viewport.dispatchEvent(new Event('scroll'))
    expect(composer.getBoundingClientRect().top).toBe(composerTop)

    const scrollOwners = [...layout.querySelectorAll<HTMLElement>('*')]
      .filter((element) => {
        return ['auto', 'scroll'].includes(getComputedStyle(element).overflowY)
          && element.scrollHeight > element.clientHeight
      })
    expect(scrollOwners).toEqual([viewport])
  })

  // https://github.com/moeru-ai/airi/actions/runs/34448585692/job/102804067154
  // ROOT CAUSE:
  //
  // The test scrolled as soon as the reply started to expand. Each later resize
  // queued a tail scroll, which could unmount the message selected by the test.
  // Virtua then retried that tail scroll when older rows were first measured.
  // Wait for the transition, measurements, and pending scroll before the jitter.
  // A slower transition exposes this race without depending on CI load.
  it.each(['200ms', '1s'])('keeps the history scrollport behind the floating composer (%s reply)', async (duration) => {
    const { chatSession, screen } = await renderArea()
    const layout = screen.getByTestId('chat-viewport-layout').element() as HTMLElement
    layout.style.height = '320px'
    layout.style.width = '320px'
    const history = screen.getByTestId('chat-history-layer').element() as HTMLElement
    const composer = screen.getByTestId('chat-composer-layer').element() as HTMLElement
    const viewport = screen.container.querySelector<HTMLElement>('.chat-history-list')
    expect(viewport).not.toBeNull()
    if (!viewport)
      throw new Error('Expected the production chat history viewport.')

    chatSession.$patch((state) => {
      state.sessionMessages['session-b'] = Array.from({ length: 100 }, (_, index) => ({
        id: `overlay-message-${index}`,
        role: 'user',
        content: `Overlay message ${index}`,
        createdAt: index,
      }))
    })

    await vi.waitFor(() => {
      expect(viewport.isConnected).toBe(true)
      expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight)
      expect(viewport.textContent).toContain('Overlay message 99')
    })

    const layoutRect = layout.getBoundingClientRect()
    const historyRect = history.getBoundingClientRect()
    const composerRect = composer.getBoundingClientRect()
    expect(historyRect.top).toBeCloseTo(layoutRect.top, 0)
    expect(historyRect.bottom).toBeCloseTo(layoutRect.bottom, 0)
    expect(composerRect.top).toBeLessThan(historyRect.bottom)

    await vi.waitFor(() => {
      const bottomPadding = Number.parseFloat(getComputedStyle(viewport).paddingBottom)
      const composerSpacerHeight = Number.parseFloat(getComputedStyle(viewport, '::after').height)
      expect(bottomPadding).toBeCloseTo(16, 0)
      expect(composerSpacerHeight).toBeGreaterThan(composerRect.height)
    })

    const replyTransition = composer.querySelector<HTMLElement>('[aria-label="stage.chat.reply.cancel"]')?.parentElement?.parentElement
    if (!replyTransition)
      throw new Error('Expected the reply transition.')
    replyTransition.style.transitionDuration = duration

    const collapsedComposerHeight = composer.getBoundingClientRect().height
    const collapsedComposerSpacerHeight = Number.parseFloat(getComputedStyle(viewport, '::after').height)
    const swipeSurface = screen.container.querySelector<HTMLElement>('[data-swipeable]')
    expect(swipeSurface).not.toBeNull()
    if (!swipeSurface)
      throw new Error('Expected a message swipe surface.')

    dispatchHorizontalPan(swipeSurface)

    await vi.waitFor(() => {
      const cancelButton = composer.querySelector<HTMLButtonElement>('[aria-label="stage.chat.reply.cancel"]')
      expect(cancelButton?.parentElement?.getAttribute('aria-hidden')).toBe('false')
      expect(composer.getBoundingClientRect().height).toBeGreaterThan(collapsedComposerHeight)
      expect(Number.parseFloat(getComputedStyle(viewport, '::after').height)).toBeGreaterThan(collapsedComposerSpacerHeight)
    })

    // Wait for the real transition and its ResizeObserver-driven tail scroll.
    await Promise.all(replyTransition.getAnimations().map(animation => animation.finished))
    await expect.poll(() => Number.parseFloat(getComputedStyle(layout).getPropertyValue('--chat-composer-height')))
      .toBeCloseTo(composer.getBoundingClientRect().height, 0)

    // Virtua's createScrollScheduler (virtua/src/core/driver.ts) retries on
    // measurements until 150ms pass. Require a quiet 200ms window before mounting
    // unmeasured older rows, which would otherwise restart that tail scroll.
    await vi.waitFor(async () => {
      const tailPosition = viewport.scrollTop
      const measuredScrollHeight = viewport.scrollHeight
      await new Promise(resolve => setTimeout(resolve, 200))
      expect(viewport.scrollTop).toBe(tailPosition)
      expect(viewport.scrollHeight).toBe(measuredScrollHeight)
    })

    // A vertical wheel expresses reader intent and stops automatic tail following.
    viewport.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -241 }))
    viewport.scrollTop = 241
    viewport.dispatchEvent(new Event('scroll'))
    await expect.poll(() => viewport.scrollTop).toBe(241)
    // scrollTop changes before Virtua replaces the mounted tail with this range.
    await expect.element(screen.getByText('Overlay message 99', { exact: true })).not.toBeInTheDocument()

    let messageBehindComposer: HTMLElement | undefined
    await vi.waitFor(() => {
      const currentComposerRect = composer.getBoundingClientRect()
      messageBehindComposer = Array.from(screen.container.querySelectorAll<HTMLElement>('.chat-message-item'))
        .filter(message => message.textContent?.includes('Overlay message'))
        .find((message) => {
          const messageRect = message.getBoundingClientRect()
          return messageRect.top < currentComposerRect.bottom && messageRect.bottom > currentComposerRect.top
        })
      expect(messageBehindComposer).toBeDefined()
    })
    if (!messageBehindComposer)
      throw new Error('Expected a mounted message behind the composer.')

    const targetText = messageBehindComposer.textContent
    const positionedScrollTop = viewport.scrollTop
    expect(positionedScrollTop).toBe(241)
    let targetWasUnmounted = false
    const targetObserver = new MutationObserver(() => {
      if (!messageBehindComposer?.isConnected)
        targetWasUnmounted = true
    })
    targetObserver.observe(viewport, { childList: true, subtree: true })
    onTestFinished(() => targetObserver.disconnect())

    viewport.scrollTop = positionedScrollTop + 1
    viewport.dispatchEvent(new Event('scroll'))
    await new Promise(resolve => setTimeout(resolve, 220))
    expect(viewport.scrollTop).toBe(positionedScrollTop + 1)

    expect(messageBehindComposer.isConnected).toBe(true)
    expect(messageBehindComposer.textContent).toBe(targetText)

    viewport.scrollTop = positionedScrollTop
    viewport.dispatchEvent(new Event('scroll'))
    await new Promise(resolve => setTimeout(resolve, 220))
    expect(viewport.scrollTop).toBe(positionedScrollTop)

    expect(messageBehindComposer.isConnected).toBe(true)
    expect(messageBehindComposer.textContent).toBe(targetText)

    viewport.scrollTop = positionedScrollTop - 1
    viewport.dispatchEvent(new Event('scroll'))
    await new Promise(resolve => setTimeout(resolve, 220))
    expect(viewport.scrollTop).toBe(positionedScrollTop - 1)

    expect(messageBehindComposer.isConnected).toBe(true)
    expect(messageBehindComposer.textContent).toBe(targetText)

    viewport.scrollTop = positionedScrollTop
    viewport.dispatchEvent(new Event('scroll'))
    await new Promise(resolve => setTimeout(resolve, 220))
    expect(viewport.scrollTop).toBe(positionedScrollTop)
    targetObserver.disconnect()

    expect(targetWasUnmounted).toBe(false)
    expect(messageBehindComposer.isConnected).toBe(true)
    expect(messageBehindComposer.textContent).toBe(targetText)
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3743121861
  it('renders the active synchronized stream through the real chat history for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // A follower received the leader-owned active stream in the real chat
    // store, but InteractiveArea passed its unrelated foreground stream to
    // ChatHistory. Mocking either store or component hid that broken binding.
    const { chat, chatStream, screen } = await renderArea()
    chat.$patch({
      activeSendSessionId: 'session-b',
      activeStreamingMessage: {
        id: 'follower-b-stream',
        role: 'assistant',
        content: 'Follower B live response',
        slices: [{ type: 'text', text: 'Follower B live response' }],
        tool_results: [],
        createdAt: 2,
      },
      sending: true,
    })
    chatStream.$patch({
      streamingMessage: {
        id: 'leader-a-stream',
        role: 'assistant',
        content: 'Leader A foreground response',
        slices: [{ type: 'text', text: 'Leader A foreground response' }],
        tool_results: [],
        createdAt: 3,
      },
    })
    await nextTick()

    await expect.element(screen.getByText('Follower B live response')).toBeVisible()
    await expect.element(screen.getByText('Leader A foreground response')).not.toBeInTheDocument()
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3743309235
  it('scopes the mobile synchronized stream to its local session for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // MobileInteractiveArea passed the synchronized global sending state and
    // foreground stream directly to ChatHistory. A mobile window on session B
    // therefore rendered the live response from a send targeting session A.
    const { chat, chatStream, screen } = await renderArea(MobileInteractiveArea)
    chat.$patch({
      activeSendSessionId: 'session-a',
      activeStreamingMessage: {
        id: 'session-a-stream',
        role: 'assistant',
        content: 'Session A live response',
        slices: [{ type: 'text', text: 'Session A live response' }],
        tool_results: [],
        createdAt: 2,
      },
      sending: true,
    })
    chatStream.$patch({
      streamingMessage: {
        id: 'session-a-foreground',
        role: 'assistant',
        content: 'Session A live response',
        slices: [{ type: 'text', text: 'Session A live response' }],
        tool_results: [],
        createdAt: 2,
      },
    })
    await nextTick()
    await expect.element(screen.getByText('Session A live response')).not.toBeInTheDocument()

    chat.$patch({
      activeSendSessionId: 'session-b',
      activeStreamingMessage: {
        id: 'session-b-stream',
        role: 'assistant',
        content: 'Session B live response',
        slices: [{ type: 'text', text: 'Session B live response' }],
        tool_results: [],
        createdAt: 3,
      },
    })
    await nextTick()
    await expect.element(screen.getByText('Session B live response')).toBeVisible()
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3743366443
  it('scopes the stage-web desktop synchronized stream to its local session for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // The shared desktop layout derived sending from the target session but
    // still passed the leader foreground stream to ChatHistory. A web window
    // on B could therefore append A's live response.
    const { chat, chatStream, screen } = await renderArea(SharedInteractiveArea)
    chat.$patch({
      activeSendSessionId: 'session-b',
      activeStreamingMessage: {
        id: 'session-b-web-stream',
        role: 'assistant',
        content: 'Session B web response',
        slices: [{ type: 'text', text: 'Session B web response' }],
        tool_results: [],
        createdAt: 2,
      },
      sending: true,
    })
    chatStream.$patch({
      streamingMessage: {
        id: 'session-a-web-foreground',
        role: 'assistant',
        content: 'Session A foreground response',
        slices: [{ type: 'text', text: 'Session A foreground response' }],
        tool_results: [],
        createdAt: 3,
      },
    })
    await nextTick()

    await expect.element(screen.getByText('Session B web response')).toBeVisible()
    await expect.element(screen.getByText('Session A foreground response')).not.toBeInTheDocument()
  })

  it('routes a stage-web send through the synchronized chat action', async () => {
    const { chat, screen } = await renderArea(SharedInteractiveArea)
    const send = vi.spyOn(chat, 'send').mockResolvedValueOnce({ messages: [], sessionId: 'session-b' })

    await submitDraft(screen, 'web follower message')

    await vi.waitFor(() => expect(send).toHaveBeenCalledWith({
      sessionId: 'session-b',
      text: 'web follower message',
    }))
  })

  it('routes a mobile send through the synchronized chat action', async () => {
    const { chat, screen } = await renderArea(MobileInteractiveArea)
    const send = vi.spyOn(chat, 'send').mockResolvedValueOnce({ messages: [], sessionId: 'session-b' })

    await submitDraft(screen, 'mobile follower message')

    await vi.waitFor(() => expect(send).toHaveBeenCalledWith({
      sessionId: 'session-b',
      text: 'mobile follower message',
    }))
  })

  it('opts the mobile composer out of browser form assistance', async () => {
    const { screen } = await renderArea(MobileInteractiveArea)
    const input = screen.getByRole('textbox').element() as HTMLTextAreaElement

    expect(input.getAttribute('autocomplete')).toBe('off')
    expect(input.getAttribute('autocapitalize')).toBe('off')
    expect(input.getAttribute('autocorrect')).toBe('off')
    expect(input.spellcheck).toBe(false)
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3755530944
  it('keeps a failed mobile draft out of a newly selected session for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Shared layouts restored a rejected send into their component-wide input
    // without checking whether the window still displayed the target session.
    const { chat, chatSession, screen } = await renderArea(MobileInteractiveArea)
    let rejectSend: ((error: Error) => void) | undefined
    vi.spyOn(chat, 'send').mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectSend = reject
    }))

    const input = await submitDraft(screen, 'mobile draft from B')
    chatSession.activeSessionId = 'session-a'
    rejectSend?.(new Error('send failed'))

    await expect.element(input).toHaveValue('')
  })

  it('does not restore a deleted-session draft in the shared chat widget', async () => {
    const { chat, screen } = await renderArea(SharedInteractiveArea)
    let rejectSend: ((error: Error) => void) | undefined
    vi.spyOn(chat, 'send').mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectSend = reject
    }))

    const input = await submitDraft(screen, 'deleted web draft')
    rejectSend?.(new Error('Chat session was removed before send completed'))

    await expect.element(input).toHaveValue('')
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3628804992
  it('does not restore a failed draft into a newly selected session for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // Failure recovery used the reactive selection instead of the session
    // captured by the send, so a late rejection could move a draft.
    const { chat, chatSession, screen } = await renderArea()
    let rejectSend: ((error: Error) => void) | undefined
    vi.spyOn(chat, 'send').mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectSend = reject
    }))

    const input = await submitDraft(screen, 'send from B')
    await expect.element(input).toHaveValue('')
    chatSession.activeSessionId = 'session-a'
    rejectSend?.(new Error('hydrate failed'))

    await expect.element(input).toHaveValue('')
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3629004140
  it('restores a failed draft when its captured session is still active for Issue #2085', async () => {
    const { chat, screen } = await renderArea()
    vi.spyOn(chat, 'send').mockRejectedValueOnce(new Error('send failed'))

    const input = await submitDraft(screen, 'retry this draft')
    await expect.element(input).toHaveValue('retry this draft')
  })

  it('keeps a newer draft when an earlier send fails', async () => {
    // ROOT CAUSE:
    //
    // Failure recovery replaced the textarea unconditionally. Text entered
    // while the request was pending was lost with its attachment previews.
    const { chat, screen } = await renderArea()
    let rejectSend: ((error: Error) => void) | undefined
    vi.spyOn(chat, 'send').mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectSend = reject
    }))

    const input = await submitDraft(screen, 'first draft')
    await userEvent.fill(input, 'newer draft')
    rejectSend?.(new Error('send failed'))

    await expect.element(input).toHaveValue('first draft\nnewer draft')
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3743366446
  it('discards a queued draft when deletion cancels its send for Issue #2085', async () => {
    const { chat, screen } = await renderArea()
    let rejectSend: ((error: Error) => void) | undefined
    vi.spyOn(chat, 'send').mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectSend = reject
    }))

    const input = await submitDraft(screen, 'discard this deleted draft')
    rejectSend?.(new Error('Chat session was reset before send could start'))

    await expect.element(input).toHaveValue('')
  })
})
