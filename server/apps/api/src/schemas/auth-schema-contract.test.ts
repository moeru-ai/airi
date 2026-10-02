import { user } from '@proj-airi/auth-shared'
import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

describe('better Auth schema contract', () => {
  it('keeps the application-owned last_seen_at user column', () => {
    const columns = getTableColumns(user)

    expect(columns.lastSeenAt).toBeDefined()
    expect(columns.lastSeenAt.name).toBe('last_seen_at')
    expect(columns.lastSeenAt.notNull).toBe(false)
  })
})
