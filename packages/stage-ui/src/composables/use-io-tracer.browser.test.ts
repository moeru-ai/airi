import { afterEach, expect, it } from 'vitest'

import { onIOSpan, serializeSpan, startSpan, subscribeIOSpan } from './use-io-tracer'

afterEach(() => onIOSpan(undefined))

it('delivers one ended span to the panel callback and every subscriber', () => {
  const panelNames: string[] = []
  const recordedSpans: ReturnType<typeof serializeSpan>[] = []
  onIOSpan(span => panelNames.push(span.name))
  const unsubscribe = subscribeIOSpan(span => recordedSpans.push(serializeSpan(span)))

  startSpan('before-unsubscribe').end()
  unsubscribe()
  startSpan('after-unsubscribe').end()

  expect(panelNames).toEqual(['before-unsubscribe', 'after-unsubscribe'])
  expect(recordedSpans).toHaveLength(1)
  expect(recordedSpans[0]).toMatchObject({ ended: true, name: 'before-unsubscribe' })
})
