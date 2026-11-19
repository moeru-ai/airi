import { integer, isoTimestamp, minValue, nonEmpty, number, object, optional, pipe, safeParse, string } from 'valibot'

/** One inbox message as Cloud returns it from `GET /v1/inbox`. */
export interface InboxMessage {
  id: string
  /** Clients render a known kind and skip an unknown kind. */
  kind: string
  params: Record<string, unknown>
  /** Empty means unread. */
  readAt: string
  createdAt: string
}

/** Rendered row content. The panel shows it without knowing the kind. */
export interface InboxMessageView {
  id: string
  title: string
  body: string
  unread: boolean
  createdAt: Date
}

type Translate = (key: string, params?: Record<string, unknown>) => string

const text = pipe(string(), nonEmpty())
const timestamp = pipe(string(), isoTimestamp())

/**
 * The client side of the closed kind list in `internal/inbox/kinds.go`. Each entry validates
 * its params again, because a client can be older or newer than the server.
 */
const kinds = {
  'flux.granted': {
    params: object({ amount: pipe(number(), integer(), minValue(1)), reason: text }),
    present: (p: { amount: number, reason: string }, t: Translate, locale: string) => ({
      title: t('stage.notifications.kinds.flux-granted.title', { amount: new Intl.NumberFormat(locale).format(p.amount) }),
      // The operator wrote this text. Render it as plain text only.
      body: p.reason,
    }),
  },
  'subscription.renewed': {
    params: object({ plan: text, periodEnd: timestamp }),
    present: (p: { plan: string, periodEnd: string }, t: Translate, locale: string) => ({
      title: t('stage.notifications.kinds.subscription-renewed.title', { plan: p.plan }),
      body: t('stage.notifications.kinds.subscription-renewed.body', { periodEnd: formatDate(p.periodEnd, locale) }),
    }),
  },
  'subscription.payment_failed': {
    params: object({ plan: text, retryAt: optional(timestamp) }),
    present: (p: { plan: string, retryAt?: string }, t: Translate, locale: string) => ({
      title: t('stage.notifications.kinds.subscription-payment-failed.title'),
      body: p.retryAt
        ? t('stage.notifications.kinds.subscription-payment-failed.body', { plan: p.plan, retryAt: formatDate(p.retryAt, locale) })
        : t('stage.notifications.kinds.subscription-payment-failed.body-no-retry', { plan: p.plan }),
    }),
  },
} as const

/**
 * Tells whether this client knows the message kind and its params are valid. The inbox store
 * keeps only these messages, so a skipped message never takes a list slot or an open action.
 */
export function isRenderableInboxMessage(message: InboxMessage): boolean {
  if (!Object.hasOwn(kinds, message.kind))
    return false
  return safeParse(kinds[message.kind as keyof typeof kinds].params, message.params).success
}

/**
 * Renders the messages that this client understands. An unknown kind or invalid params drop the
 * message, so the server can release a new kind before every client knows it.
 */
export function presentInboxMessages(messages: InboxMessage[], t: Translate, locale: string): InboxMessageView[] {
  const views: InboxMessageView[] = []
  for (const message of messages) {
    if (!Object.hasOwn(kinds, message.kind))
      continue
    const kind = kinds[message.kind as keyof typeof kinds]
    const parsed = safeParse(kind.params, message.params)
    if (!parsed.success)
      continue
    const content = (kind.present as (params: unknown, t: Translate, locale: string) => Omit<InboxMessageView, 'id' | 'unread' | 'createdAt'>)(parsed.output, t, locale)
    views.push({ ...content, id: message.id, unread: message.readAt === '', createdAt: new Date(message.createdAt) })
  }
  return views
}

/**
 * Formats a message age. Messages older than one week show the date, because a relative
 * value such as "23 days ago" is harder to place.
 *
 * @example
 * formatAge(new Date('2026-10-18T09:58:00Z'), new Date('2026-10-18T10:00:00Z'), 'en', t)
 * // => '2 minutes ago'
 */
export function formatAge(createdAt: Date, now: Date, locale: string, t: Translate): string {
  const seconds = Math.round((now.getTime() - createdAt.getTime()) / 1000)
  if (seconds < 60)
    return t('stage.notifications.just-now')
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (seconds < 3600)
    return relative.format(-Math.floor(seconds / 60), 'minute')
  if (seconds < 86400)
    return relative.format(-Math.floor(seconds / 3600), 'hour')
  if (seconds < 7 * 86400)
    return relative.format(-Math.floor(seconds / 86400), 'day')
  return formatDate(createdAt.toISOString(), locale)
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(value))
}
