import { expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'

import StatusCapsule from './status-capsule.vue'

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
