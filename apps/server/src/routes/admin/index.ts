import type { Context } from 'hono'

import type { Database } from '../../libs/db'
import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { BillingService } from '../../services/domain/billing/billing-service'
import type { HonoEnv } from '../../types/hono'

import { and, asc, count, desc, eq, gt, ilike, isNull, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { integer, maxLength, maxValue, minValue, nonEmpty, number, object, optional, pipe, safeParse, string } from 'valibot'

import { adminGuard } from '../../middlewares/admin-guard'
import { authGuard } from '../../middlewares/auth'
import { session as sessionTable, user as userTable } from '../../schemas/accounts'
import { userFlux } from '../../schemas/flux'
import { fluxTransaction } from '../../schemas/flux-transaction'
import { llmRequestLog } from '../../schemas/llm-request-log'
import { createBadRequestError, createNotFoundError } from '../../utils/error'
import { createQueryIntegerSchema } from '../../utils/http-query'

const MAX_FLUX_ADJUSTMENT = 1_000_000_000

const ListUsersQuerySchema = object({
  limit: createQueryIntegerSchema({
    defaultValue: 20,
    minimum: 1,
    maximum: 100,
  }),
  offset: createQueryIntegerSchema({
    defaultValue: 0,
    minimum: 0,
  }),
  query: optional(pipe(string(), maxLength(200)), ''),
  status: optional(pipe(string(), maxLength(20)), 'all'),
  sortKey: optional(pipe(string(), maxLength(40)), 'createdAt'),
  sortDirection: optional(pipe(string(), maxLength(10)), 'desc'),
})

const GrantUserFluxBodySchema = object({
  amount: pipe(number(), integer('amount must be an integer'), minValue(1, 'amount must be at least 1')),
  description: pipe(string(), nonEmpty('description is required'), maxLength(500)),
  idempotencyKey: optional(pipe(string(), maxLength(100))),
})

const SetUserFluxBodySchema = object({
  balance: pipe(
    number(),
    integer('balance must be an integer'),
    minValue(0, 'balance must be at least 0'),
    maxValue(MAX_FLUX_ADJUSTMENT, `balance must be at most ${MAX_FLUX_ADJUSTMENT}`),
  ),
  description: optional(pipe(string(), maxLength(500)), 'Admin balance adjustment'),
})

export interface AdminRoutesDeps {
  db: Database
  billingService: BillingService
  configKV: ConfigKVService
}

function serializeUser(row: {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  createdAt: Date
  updatedAt: Date
  flux: number | null
  stripeCustomerId: string | null
}) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailVerified: row.emailVerified,
    image: row.image,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    flux: row.flux ?? 0,
    stripeCustomerId: row.stripeCustomerId,
  }
}

function userSortExpression(sortKey: string) {
  switch (sortKey) {
    case 'name':
      return userTable.name
    case 'email':
      return userTable.email
    case 'status':
      return userTable.emailVerified
    case 'flux':
      return sql<number>`coalesce(${userFlux.flux}, 0)`
    case 'createdAt':
      return userTable.createdAt
    default:
      throw createBadRequestError('Invalid sort key', 'INVALID_SORT_KEY', { sortKey })
  }
}

function userSortDirection(sortDirection: string) {
  switch (sortDirection) {
    case 'asc':
      return asc
    case 'desc':
      return desc
    default:
      throw createBadRequestError('Invalid sort direction', 'INVALID_SORT_DIRECTION', { sortDirection })
  }
}

function userStatusWhere(status: string) {
  switch (status) {
    case 'all':
      return undefined
    case 'verified':
      return eq(userTable.emailVerified, true)
    case 'unverified':
      return eq(userTable.emailVerified, false)
    default:
      throw createBadRequestError('Invalid status filter', 'INVALID_STATUS_FILTER', { status })
  }
}

async function readJson(c: Context<HonoEnv>): Promise<unknown> {
  const raw = await c.req.json().catch(() => null)
  if (raw == null)
    throw createBadRequestError('Request body must be JSON', 'INVALID_BODY')
  return raw
}

async function ensureUserExists(db: Database, userId: string) {
  const [target] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1)

  if (!target)
    throw createNotFoundError('User not found', { userId })
}

export function createAdminRoutes(deps: AdminRoutesDeps) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .use('*', adminGuard)

    .get('/me', async (c) => {
      const user = c.get('user')!
      return c.json({
        role: 'admin',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          image: user.image,
        },
      })
    })

    .get('/metrics', async (c) => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)

      const [
        totalUsers,
        verifiedUsers,
        activeSessions,
        currentFlux,
        issuedFlux,
        llmRequests24h,
        llmFlux24h,
        adminUsers,
      ] = await Promise.all([
        deps.db.select({ count: count() }).from(userTable),
        deps.db.select({ count: count() }).from(userTable).where(eq(userTable.emailVerified, true)),
        deps.db.select({ count: count() }).from(sessionTable).where(gt(sessionTable.expiresAt, new Date())),
        deps.db.select({ total: sql<number>`coalesce(sum(${userFlux.flux}), 0)::int` }).from(userFlux).where(isNull(userFlux.deletedAt)),
        deps.db.select({ total: sql<number>`coalesce(sum(${fluxTransaction.amount}) filter (where ${fluxTransaction.type} in ('credit', 'initial', 'promo')), 0)::int` }).from(fluxTransaction),
        deps.db.select({ count: count() }).from(llmRequestLog).where(gt(llmRequestLog.createdAt, yesterday)),
        deps.db.select({ total: sql<number>`coalesce(sum(${llmRequestLog.fluxConsumed}), 0)::int` }).from(llmRequestLog).where(gt(llmRequestLog.createdAt, yesterday)),
        deps.db
          .select({ count: count() })
          .from(userTable)
          .where(sql<boolean>`'admin' = any(regexp_split_to_array(coalesce(${userTable.role}, ''), '\\s*,\\s*'))`),
      ])

      return c.json({
        totalUsers: Number(totalUsers[0]?.count ?? 0),
        verifiedUsers: Number(verifiedUsers[0]?.count ?? 0),
        activeSessions: Number(activeSessions[0]?.count ?? 0),
        currentFlux: Number(currentFlux[0]?.total ?? 0),
        issuedFlux: Number(issuedFlux[0]?.total ?? 0),
        llmRequests24h: Number(llmRequests24h[0]?.count ?? 0),
        llmFlux24h: Number(llmFlux24h[0]?.total ?? 0),
        adminSeats: Number(adminUsers[0]?.count ?? 0),
        grafanaEmbedUrl: null,
      })
    })

    .get('/users', async (c) => {
      const query = safeParse(ListUsersQuerySchema, {
        limit: c.req.query('limit'),
        offset: c.req.query('offset'),
        query: c.req.query('query'),
        sortDirection: c.req.query('sortDirection'),
        sortKey: c.req.query('sortKey'),
        status: c.req.query('status'),
      })

      if (!query.success) {
        throw createBadRequestError('Invalid query', 'INVALID_QUERY', query.issues)
      }

      const search = query.output.query.trim()
      const searchWhere = search
        ? or(
            eq(userTable.id, search),
            ilike(userTable.email, `%${search}%`),
            ilike(userTable.name, `%${search}%`),
          )
        : undefined
      const statusWhere = userStatusWhere(query.output.status)
      const where = searchWhere && statusWhere
        ? and(searchWhere, statusWhere)
        : searchWhere ?? statusWhere
      const sort = userSortDirection(query.output.sortDirection)
      const sortExpression = userSortExpression(query.output.sortKey)

      const [rows, totalRows] = await Promise.all([
        deps.db
          .select({
            id: userTable.id,
            name: userTable.name,
            email: userTable.email,
            emailVerified: userTable.emailVerified,
            image: userTable.image,
            createdAt: userTable.createdAt,
            updatedAt: userTable.updatedAt,
            flux: userFlux.flux,
            stripeCustomerId: userFlux.stripeCustomerId,
          })
          .from(userTable)
          .leftJoin(userFlux, and(
            eq(userTable.id, userFlux.userId),
            isNull(userFlux.deletedAt),
          ))
          .where(where)
          .orderBy(sort(sortExpression), desc(userTable.createdAt))
          .limit(query.output.limit + 1)
          .offset(query.output.offset),
        deps.db
          .select({ count: count() })
          .from(userTable)
          .where(where),
      ])

      const hasMore = rows.length > query.output.limit
      if (hasMore)
        rows.pop()

      return c.json({
        users: rows.map(serializeUser),
        hasMore,
        nextOffset: hasMore ? query.output.offset + query.output.limit : null,
        total: Number(totalRows[0]?.count ?? 0),
      })
    })

    .get('/users/:id', async (c) => {
      const id = c.req.param('id')

      const [row] = await deps.db
        .select({
          id: userTable.id,
          name: userTable.name,
          email: userTable.email,
          emailVerified: userTable.emailVerified,
          image: userTable.image,
          createdAt: userTable.createdAt,
          updatedAt: userTable.updatedAt,
          flux: userFlux.flux,
          stripeCustomerId: userFlux.stripeCustomerId,
        })
        .from(userTable)
        .leftJoin(userFlux, and(
          eq(userTable.id, userFlux.userId),
          isNull(userFlux.deletedAt),
        ))
        .where(eq(userTable.id, id))
        .limit(1)

      if (!row)
        throw createNotFoundError('User not found', { id })

      const transactions = await deps.db.query.fluxTransaction.findMany({
        where: eq(fluxTransaction.userId, id),
        orderBy: [desc(fluxTransaction.createdAt)],
        limit: 20,
      })

      return c.json({
        user: serializeUser(row),
        recentFluxTransactions: transactions.map(tx => ({
          id: tx.id,
          type: tx.type,
          amount: tx.amount,
          balanceBefore: tx.balanceBefore,
          balanceAfter: tx.balanceAfter,
          description: tx.description,
          metadata: tx.metadata,
          createdAt: tx.createdAt.toISOString(),
        })),
      })
    })

    .post('/users/:id/flux/grant', async (c) => {
      const actor = c.get('user')!
      const userId = c.req.param('id')
      await ensureUserExists(deps.db, userId)

      const parsed = safeParse(GrantUserFluxBodySchema, await readJson(c))
      if (!parsed.success) {
        throw createBadRequestError('Invalid request body', 'INVALID_BODY', parsed.issues)
      }

      const result = await deps.billingService.creditFlux({
        userId,
        amount: parsed.output.amount,
        requestId: parsed.output.idempotencyKey,
        description: parsed.output.description,
        source: 'admin.user_grant',
        type: 'promo',
        auditMetadata: {
          source: 'admin.user_grant',
          issuedByUserId: actor.id,
        },
      })

      return c.json(result)
    })

    .patch('/users/:id/flux', async (c) => {
      const actor = c.get('user')!
      const userId = c.req.param('id')
      await ensureUserExists(deps.db, userId)

      const parsed = safeParse(SetUserFluxBodySchema, await readJson(c))
      if (!parsed.success) {
        throw createBadRequestError('Invalid request body', 'INVALID_BODY', parsed.issues)
      }

      const result = await deps.billingService.setFlux({
        userId,
        balance: parsed.output.balance,
        description: parsed.output.description,
        issuedByUserId: actor.id,
      })

      return c.json({
        ...result,
        changed: result.balanceBefore !== result.balanceAfter,
      })
    })
}
