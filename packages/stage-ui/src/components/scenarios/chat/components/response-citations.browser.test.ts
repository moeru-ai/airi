import { expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'

import ResponseCitations from './response-citations.vue'

it('renders provider sources as safe, visible links after a history restore', async () => {
  const citations = structuredClone([
    { url: 'https://example.com/report', title: 'Weather report', startIndex: 0, endIndex: 6 },
    { url: 'javascript:alert(1)', title: 'Unsafe source', startIndex: 0, endIndex: 6 },
  ])
  const view = render(ResponseCitations, { props: { citations } })
  await expect.element(view.getByRole('link', { name: '[1] Weather report' })).toHaveAttribute('href', 'https://example.com/report')
  await expect.element(view.getByRole('link', { name: '[1] Weather report' })).toHaveAttribute('rel', 'noopener noreferrer')
  await expect.element(view.getByRole('link', { name: 'Unsafe source' })).not.toBeInTheDocument()
})
