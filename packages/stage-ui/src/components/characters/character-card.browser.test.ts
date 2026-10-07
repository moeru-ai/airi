import { expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { h } from 'vue'

import CharacterCard from './character-card.vue'

it('renders character content without adding navigation or editing controls', async () => {
  const screen = await render(CharacterCard, { props: { name: 'Luna', description: 'A stargazer' } })

  await expect.element(screen.getByRole('heading', { name: 'Luna' })).toBeVisible()
  await expect.element(screen.getByText('A stargazer')).toBeVisible()
  await expect.element(screen.getByRole('button')).not.toBeInTheDocument()
  await expect.element(screen.getByRole('link')).not.toBeInTheDocument()
  await expect.element(screen.getByRole('combobox')).not.toBeInTheDocument()
})

it('keeps caller-owned metadata and footer actions independent', async () => {
  let likes = 0
  const screen = await render(CharacterCard, {
    props: { name: 'Sol', description: 'A travel companion' },
    slots: {
      meta: '<span>Active</span>',
      footer: () => h('button', { onClick: () => likes++ }, 'Like'),
    },
  })

  await expect.element(screen.getByText('Active')).toBeVisible()
  await screen.getByRole('button', { name: 'Like' }).click()
  expect(likes).toBe(1)
  await expect.element(screen.getByRole('heading', { name: 'Sol' })).toBeVisible()
})
