// Verification: docs/ai/context/verification-automation.md
// Source doc: apps/server/docs/ai-context/verifications/admin-flux-grants.md
//
// Covers the three user paths from the verification doc:
//   Path 1: admin POST /api/admin/flux-grants → 200 + granted array, ledger row written
//   Path 2: ?dryRun=true → preview returned, ledger unchanged
//   Path 3: adminGuard rejects (401 no session / 403 non-admin role)

import type { Harness } from './_harness'

import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { startVerificationContext } from './_harness'

const ADMIN_EMAIL = 'admin@example.com'

describe('verification: admin-flux-grants', () => {
  let ctx: Harness

  beforeEach(async () => {
    ctx = await startVerificationContext()
    ctx.setConfig({ INITIAL_USER_FLUX: 0 })
    // Admin user (caller). Admin access is role-based (`role === 'admin'`).
    await ctx.seedUser({ id: 'admin-1', email: ADMIN_EMAIL, balance: 0 })
  })

  afterAll(async () => {
    // PGlite is per-context and per-test — letting it drop out of scope is enough.
  })

  describe('path 1: admin synchronously grants flux', () => {
    it('credits 100 flux to each existing recipient and returns the per-email outcome buckets', async () => {
      await ctx.seedUser({ id: 'recipient-1', email: 'rec1@example.com', balance: 0 })
      await ctx.seedUser({ id: 'recipient-2', email: 'rec2@example.com', balance: 25 })
      ctx.setSessionUser({ id: 'admin-1', email: ADMIN_EMAIL, role: 'admin' })

      const res = await ctx.app.request('/api/admin/flux-grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'integration-test grant',
          amount: 100,
          emails: ['rec1@example.com', 'rec2@example.com'],
        }),
      })

      expect(res.status).toBe(200)
      const body = await res.json() as {
        summary: { willGrant: number, totalFluxToIssue: number }
        result: {
          granted: { email: string, userId: string, fluxTransactionId: string, balanceAfter: number }[]
          skipped: unknown[]
          failed: unknown[]
        }
      }

      expect(body.summary.willGrant).toBe(2)
      expect(body.summary.totalFluxToIssue).toBe(200)
      expect(body.result.failed).toEqual([])
      expect(body.result.skipped).toEqual([])
      expect(body.result.granted).toHaveLength(2)

      const granted1 = body.result.granted.find(g => g.email === 'rec1@example.com')
      const granted2 = body.result.granted.find(g => g.email === 'rec2@example.com')
      expect(granted1?.balanceAfter).toBe(100)
      expect(granted2?.balanceAfter).toBe(125)
      expect(granted1?.fluxTransactionId).toBeTruthy()

      // Ledger writes per recipient with type='promo' and the operator id in metadata.
      const rec1Ledger = await ctx.db.query.fluxTransaction.findMany({
        where: eq(ctx.schema.fluxTransaction.userId, 'recipient-1'),
      })
      expect(rec1Ledger).toHaveLength(1)
      expect(rec1Ledger[0].type).toBe('promo')
      expect(rec1Ledger[0].amount).toBe(100)
      expect(rec1Ledger[0].balanceBefore).toBe(0)
      expect(rec1Ledger[0].balanceAfter).toBe(100)
      expect(rec1Ledger[0].description).toBe('integration-test grant')
      const meta = rec1Ledger[0].metadata as { issuedByUserId?: string, description?: string }
      expect(meta?.issuedByUserId).toBe('admin-1')
    })
  })

  describe('path 2: dry-run preview', () => {
    it('reports willGrant / notFound / duplicateInInput without writing a ledger row', async () => {
      await ctx.seedUser({ id: 'recipient-1', email: 'rec1@example.com', balance: 0 })
      ctx.setSessionUser({ id: 'admin-1', email: ADMIN_EMAIL, role: 'admin' })

      const res = await ctx.app.request('/api/admin/flux-grants?dryRun=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'smoke',
          amount: 100,
          emails: [
            'rec1@example.com',
            'REC1@example.com', // case-variant duplicate
            'ghost@nope.example', // not_found
            'rec1@example.com', // exact duplicate
          ],
        }),
      })

      expect(res.status).toBe(200)
      const body = await res.json() as {
        preview: {
          totalEmails: number
          willGrant: number
          willSkip: { notFound: number, userDeleted: number, duplicateInInput: number }
          totalFluxToIssue: number
        }
      }
      expect(body.preview.totalEmails).toBe(4)
      expect(body.preview.willGrant).toBe(1)
      expect(body.preview.willSkip.notFound).toBe(1)
      expect(body.preview.willSkip.duplicateInInput).toBe(2)
      expect(body.preview.totalFluxToIssue).toBe(100)

      // Ledger must be untouched.
      const ledger = await ctx.db.query.fluxTransaction.findMany({
        where: eq(ctx.schema.fluxTransaction.userId, 'recipient-1'),
      })
      expect(ledger).toEqual([])
    })
  })

  describe('path 3: adminGuard rejects unauthorized callers', () => {
    it('returns 401 when no session is attached', async () => {
      ctx.setSessionUser(null)

      const res = await ctx.app.request('/api/admin/flux-grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'x', amount: 1, emails: ['a@b.com'] }),
      })

      expect(res.status).toBe(401)
    })

    it('returns 403 when the session user has no admin role', async () => {
      await ctx.seedUser({ id: 'normie', email: 'normie@example.com', balance: 0 })
      ctx.setSessionUser({ id: 'normie', email: 'normie@example.com', role: 'user' })

      const res = await ctx.app.request('/api/admin/flux-grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'x', amount: 1, emails: ['a@b.com'] }),
      })

      expect(res.status).toBe(403)
    })
  })
})
