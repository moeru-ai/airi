import en from '@proj-airi/i18n/locales/en'

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import PlayRoom from './play-room.vue'

import 'virtual:uno.css'

afterEach(cleanup)

async function openRoom(game: string) {
  const screen = await render(PlayRoom, {
    props: { modelId: 'model-one' },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
  await screen.getByRole('button', { name: game, exact: false }).click()
  const staticMode = screen.getByRole('button', { name: 'Static, step-by-step play', exact: false })
  if (staticMode.element().getAttribute('aria-pressed') !== 'true')
    await staticMode.click()
  await screen.getByRole('button', { name: 'Start game', exact: true }).click()
  return screen
}

async function step(screen: Awaited<ReturnType<typeof openRoom>>, count: number) {
  for (let index = 0; index < count; index++) {
    const button = screen.getByRole('button', { name: 'Advance one step', exact: true })
    if (button.element().hasAttribute('disabled'))
      break
    await button.click()
  }
}

describe('companion play room', () => {
  it('provides a playable three-throw paper game with accessible aiming', async () => {
    const screen = await openRoom('Paper toss Three throws.')
    await screen.getByRole('spinbutton', { name: 'Throw angle', exact: true }).fill('55')
    await screen.getByRole('spinbutton', { name: 'Throw strength', exact: true }).fill('75')
    for (let round = 0; round < 3; round++) {
      await screen.getByRole('button', { name: 'Throw paper', exact: true }).click()
      await step(screen, 6)
      if (round < 2)
        await screen.getByRole('button', { name: 'Next round', exact: true }).click()
    }
    await expect.element(screen.getByText('Session complete', { exact: true })).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Throw paper', exact: true })).toBeDisabled()
  })

  it('plays every falling star with movement buttons and stops after twelve', async () => {
    const screen = await openRoom('Catch the stars Move your tray')
    await screen.getByRole('button', { name: 'Move left', exact: true }).click()
    await screen.getByRole('button', { name: 'Move right', exact: true }).click()
    await step(screen, 65)
    await expect.element(screen.getByText('Session complete', { exact: true })).toBeVisible()
    await expect.element(screen.getByText('0 stars left', { exact: true })).toBeVisible()
  })

  it('reveals a precommitted hand and rejects a second rapid choice', async () => {
    const screen = await openRoom('Rock paper scissors First to two wins.')
    await screen.getByRole('button', { name: 'Rock', exact: true }).click()
    await expect.element(screen.getByRole('button', { name: 'Paper', exact: true })).toBeDisabled()
    await step(screen, 2)
    await expect.element(screen.getByText(/You chose Rock\. AIRI chose/)).toBeVisible()
    await expect.element(screen.getByRole('list', { name: 'Round history' })).toBeVisible()
    await screen.getByRole('button', { name: 'Next round', exact: true }).click()
    await expect.element(screen.getByRole('button', { name: 'Rock', exact: true })).toBeEnabled()
  })

  it('allows an untimed gesture sequence and restarts replay from the first cue', async () => {
    const screen = await openRoom('Copy the gesture Watch three poses')
    const sequence: string[] = []
    let shown = 0
    for (let index = 0; index < 9; index++) {
      const cue = screen.getByText(/^Pose \d of 3:/).element().textContent ?? ''
      const match = cue.match(/Pose (\d) of 3: (Wave|Point|Bow)/)
      if (match && Number(match[1]) !== shown) {
        shown = Number(match[1])
        sequence.push(match[2])
      }
      await step(screen, 1)
    }
    expect(sequence).toHaveLength(3)
    await expect.element(screen.getByText('Your turn: 0 of 3 poses repeated', { exact: true })).toBeVisible()
    await screen.getByRole('button', { name: sequence[0], exact: true }).click()
    await screen.getByRole('button', { name: 'Show the sequence again', exact: true }).click()
    await expect.element(screen.getByText(`Pose 1 of 3: ${sequence[0]}`, { exact: true })).toBeVisible()
    await step(screen, 9)
    for (const gesture of sequence)
      await screen.getByRole('button', { name: gesture, exact: true }).click()
    await expect.element(screen.getByText('You got it!', { exact: true })).toBeVisible()
    await expect.element(screen.getByText('Score: 1', { exact: true })).toBeVisible()
  })

  it('provides a complete text alternative for tracking the hidden cup', async () => {
    const screen = await openRoom('Find the hidden star Follow the star')
    const reveal = screen.getByText(/^The star is at position/).element().textContent ?? ''
    let position = Number(reveal.match(/position (\d)/)?.[1])
    await step(screen, 12)
    const swaps = screen.getByRole('list', { name: 'Cup swaps' }).element().querySelectorAll('li')
    expect(swaps).toHaveLength(3)
    for (const swap of swaps) {
      const match = swap.textContent?.match(/positions (\d) and (\d)/)
      if (!match)
        throw new Error('Expected accessible swap text')
      if (position === Number(match[1]))
        position = Number(match[2])
      else if (position === Number(match[2]))
        position = Number(match[1])
    }
    await screen.getByRole('button', { name: `Cup at position ${position}`, exact: true }).click()
    await expect.element(screen.getByText('You got it!', { exact: true })).toBeVisible()
    await expect.element(screen.getByText('Score: 1', { exact: true })).toBeVisible()
  })

  it('moves follow-me markers with focused keyboard input and pauses on pointer exit', async () => {
    const screen = await openRoom('Follow me Follow six markers')
    const field = screen.getByRole('group', { name: 'Game playfield', exact: true }).element()
    ;(field as HTMLElement).focus()
    expect(document.activeElement).toBe(field)
    const marker = screen.getByLabelText('Your marker', { exact: true }).element() as HTMLElement
    expect(marker.style.left).toBe('50%')
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    await expect.poll(() => marker.style.left).toBe('45%')
    await screen.getByRole('button', { name: 'Move up', exact: true }).click()
    expect(marker.style.top).toBe('85%')
    field.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }))
    await expect.element(screen.getByRole('button', { name: 'Move left', exact: true })).toBeEnabled()
    await screen.getByRole('button', { name: 'Pointer control', exact: false }).click()
    field.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'touch', buttons: 0 }))
    await expect.element(screen.getByRole('button', { name: 'Move left', exact: true })).toBeEnabled()
    field.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }))
    await expect.element(screen.getByText('The pointer left the playfield.', { exact: true })).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Move left', exact: true })).toBeDisabled()
    await screen.getByRole('button', { name: 'Resume', exact: true }).click()
    await expect.element(screen.getByRole('button', { name: 'Move left', exact: true })).toBeEnabled()
  })

  it('cleans up on pause, rapid restart, model switch, and unmount', async () => {
    const screen = await openRoom('Catch the stars Move your tray')
    await step(screen, 2)
    await screen.getByRole('button', { name: 'Pause', exact: true }).click()
    await expect.element(screen.getByRole('button', { name: 'Advance one step', exact: true })).toBeDisabled()
    await screen.getByRole('button', { name: 'Resume', exact: true }).click()
    for (let restart = 0; restart < 10; restart++)
      await screen.getByRole('button', { name: 'Restart with this seed', exact: true }).click()
    await expect.element(screen.getByText('Score: 0', { exact: true })).toBeVisible()
    await screen.rerender({ modelId: 'model-two' })
    await expect.element(screen.getByRole('button', { name: 'Start game', exact: true })).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Stop game', exact: true })).toBeDisabled()
    await screen.unmount()
  })

  it('pauses for focus loss, ownership interruption, and real element resize', async () => {
    const screen = await openRoom('Catch the stars Move your tray')
    window.dispatchEvent(new Event('blur'))
    await expect.element(screen.getByText('The window lost focus or became hidden.', { exact: true })).toBeVisible()
    await screen.getByRole('button', { name: 'Resume', exact: true }).click()
    await screen.rerender({ suspended: true })
    await expect.element(screen.getByText('Another companion interaction took priority.', { exact: true })).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Resume', exact: true })).toBeDisabled()
    await screen.rerender({ suspended: false })
    await screen.getByRole('button', { name: 'Resume', exact: true }).click()
    const field = screen.getByRole('group', { name: 'Game playfield', exact: true }).element() as HTMLElement
    field.style.width = '320px'
    await expect.element(screen.getByText('The playfield changed size.', { exact: true })).toBeVisible()
  })
})
