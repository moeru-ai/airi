import type { BackdropSurfaceHost } from '../../../composables/backdrop-surface'

import { expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'

import StatusCapsule from './status-capsule.vue'

import { backdropSurfaceHostKey } from '../../../composables/backdrop-surface'

import 'virtual:uno.css'

it('keeps expanded details inside the hit-test bounds and exposes errors without motion', async () => {
  // ROOT CAUSE:
  // Electron checks the wrapper bounds before enabling mouse events. An
  // absolutely positioned detail panel falls outside those bounds.
  const screen = render(StatusCapsule, { props: { tone: 'error', label: 'Transcription failed', details: 'Provider timed out' } })
  const button = screen.getByRole('button', { name: 'Transcription failed' })
  await button.click()
  await expect.element(screen.getByText('Provider timed out')).toBeVisible()
  const capsule = button.element().parentElement!
  const panel = screen.getByText('Provider timed out').element()
  expect(panel.getBoundingClientRect().top).toBeGreaterThanOrEqual(capsule.getBoundingClientRect().top)
  expect(panel.getBoundingClientRect().bottom).toBeLessThanOrEqual(capsule.getBoundingClientRect().bottom)
  expect(capsule.querySelector('.status-bar-busy')).toBeNull()
  await button.click()
  await expect.element(button).toHaveAttribute('aria-expanded', 'false')
})

it('renders the caller indicator without adding business symbols', async () => {
  const screen = render(StatusCapsule, { props: { label: 'Signed in', reveal: true }, slots: { indicator: '<span data-testid="login-symbol">✓</span>' } })
  await expect.element(screen.getByTestId('login-symbol')).toBeVisible()
  expect(screen.getByRole('button').element().querySelectorAll('.hearing-bar')).toHaveLength(0)
})

it('declares the capsule and its open details as glass surfaces', async () => {
  // The desktop host draws native glass only behind declared surfaces, so a capsule over the stage must declare its fills.
  const registered = new Set<HTMLElement>()
  const host: BackdropSurfaceHost = {
    register(element) {
      registered.add(element)
      return () => registered.delete(element)
    },
  }
  const screen = render(StatusCapsule, {
    props: { label: 'Signed in', details: 'Account details' },
    global: { provide: { [backdropSurfaceHostKey as symbol]: host } },
  })
  const button = screen.getByRole('button', { name: 'Signed in' })
  await expect.poll(() => registered.size).toBe(1)
  expect(button.element().contains([...registered][0])).toBe(true)

  await button.click()
  await expect.element(screen.getByText('Account details')).toBeVisible()
  await expect.poll(() => registered.size).toBe(2)

  await button.click()
  await expect.poll(() => registered.size).toBe(1)
})
