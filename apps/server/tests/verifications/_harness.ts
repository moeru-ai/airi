import type { Database } from '../../src/libs/db'

import { Buffer } from 'node:buffer'

import { vi } from 'vitest'

import { buildApp } from '../../src/app'
import { mockDB } from '../../src/libs/mock-db'
import { createAdminFluxGrantsService } from '../../src/services/domain/admin/flux-grants'
import { createBillingService } from '../../src/services/domain/billing/billing-service'
import { createFluxService } from '../../src/services/domain/flux'
import { createUserDeletionService } from '../../src/services/domain/user-deletion'
import { userFluxRedisKey } from '../../src/utils/redis-keys'

import * as schema from '../../src/schemas'

// NOTICE:
// drizzle-kit's `pushSchema` (called by `mockDB`) takes ~500ms per invocation.
// Vitest spawns a fresh worker per test file, so a module-level promise scopes
// the cache correctly: schema push runs once per file, every
// `startVerificationContext()` after that reuses the in-memory PGlite and
// only truncates rows. See `docs/ai/context/verification-automation.md` for
// the broader rationale on test boot cost.
let sharedDbPromise: Promise<Database> | null = null

async function getSharedDb(): Promise<Database> {
  sharedDbPromise ??= mockDB(schema)
  return sharedDbPromise
}

async function resetDataRows(db: Database): Promise<void> {
  // Delete in FK-safe order. better-auth's session / account / verification
  // tables reference user with `onDelete: cascade`, so deleting `user` last
  // implicitly clears them — we still call them out for clarity and so a
  // future test that seeds sessions directly does not silently leak rows.
  await db.delete(schema.fluxTransaction)
  await db.delete(schema.userFlux)
  await db.delete(schema.session)
  await db.delete(schema.account)
  await db.delete(schema.user)
}

interface SeedUserOptions {
  id: string
  email?: string
  balance: number
}

interface SessionUser {
  id: string
  email: string
  emailVerified?: boolean
  name?: string
  /** better-auth `admin` plugin role. Set `'admin'` to pass `adminGuard`. */
  role?: string | null
}

export type Harness = Awaited<ReturnType<typeof startVerificationContext>>

/**
 * Boots a Hono app with the same wiring as production for a verification
 * scenario.
 *
 * Use when:
 * - You need to assert a full user path (HTTP -> route -> service -> DB / ledger)
 *   rather than a unit-level code path
 * - You want real `createFluxService` + `createBillingService` against a real
 *   in-memory Postgres (PGlite), with auth / OIDC / WebSocket / OTel stubbed
 *
 * Expects:
 * - No external network. The mock router never opens sockets so
 *   pre-flight-rejecting cases never reach it; tests that actually need an
 *   upstream LLM response must stub `fetch` themselves
 *
 * Returns:
 * - A `Harness` value with the mounted app, drizzle handle, and helpers to
 *   set a session user, seed flux balance, override config keys, and inspect
 *   the in-memory Redis store
 */

export async function startVerificationContext() {
  const db = await getSharedDb()
  await resetDataRows(db)

  let activeSession: { user: any, session: any } | null = null

  const auth: any = {
    api: {
      getSession: vi.fn(async () => activeSession),
      getOAuthServerConfig: vi.fn(async () => ({})),
      getOpenIdConfig: vi.fn(async () => ({})),
    },
    handler: vi.fn(async () => new Response('not-found', { status: 404 })),
  }

  const configStore: Record<string, any> = {
    FLUX_PER_REQUEST: 1,
    INITIAL_USER_FLUX: 0,
    AUTH_RATE_LIMIT_MAX: 1000,
    AUTH_RATE_LIMIT_WINDOW_SEC: 60,
    FLUX_PER_1K_CHARS_TTS: 2,
    TTS_DEBT_TTL_SECONDS: 86400,
  }
  const configKV: any = {
    get: vi.fn(async (key: string) => configStore[key]),
    getOrThrow: vi.fn(async (key: string) => {
      if (configStore[key] === undefined)
        throw new Error(`Config key "${key}" is not set`)
      return configStore[key]
    }),
    getOptional: vi.fn(async (key: string) => (configStore[key] ?? null)),
    set: vi.fn(async (key: string, value: any) => {
      configStore[key] = value
    }),
  }

  const redisStore = new Map<string, string>()
  const redisSubscriber = {
    on: vi.fn(),
    subscribe: vi.fn(async () => 1),
    unsubscribe: vi.fn(async () => 0),
    quit: vi.fn(async () => 'OK'),
  }
  const redis: any = {
    get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
    getBuffer: vi.fn(async (key: string) => {
      const v = redisStore.get(key)
      return v ? Buffer.from(v, 'utf8') : null
    }),
    set: vi.fn(async (key: string, value: any) => {
      redisStore.set(key, String(value))
      return 'OK'
    }),
    del: vi.fn(async (key: string) => (redisStore.delete(key) ? 1 : 0)),
    incrby: vi.fn(async (key: string, by: number) => {
      const next = (Number.parseInt(redisStore.get(key) ?? '0', 10) || 0) + by
      redisStore.set(key, String(next))
      return next
    }),
    expire: vi.fn(async () => 1),
    duplicate: vi.fn(() => redisSubscriber),
    publish: vi.fn(async () => 0),
  }

  const fluxService = createFluxService(db, redis, configKV)
  const billingService = createBillingService(db, redis, configKV)
  const adminFluxGrantsService = createAdminFluxGrantsService({ db, billingService })

  // NOTICE:
  // Production wires 5 soft-delete handlers (stripe / flux / providers /
  // characters / chats). The harness only wires `flux` so the verification
  // for "balance soft-deleted + ledger preserved" can run without dragging
  // in stripe SDK, character / chat / provider services. Tests covering the
  // other 4 handlers should opt in via a future option flag rather than
  // widening the default wiring.
  const userDeletionService = createUserDeletionService()
  userDeletionService.register({
    name: 'flux',
    priority: 20,
    softDelete: ({ userId }) => fluxService.deleteAllForUser(userId),
  })

  // NOTICE:
  // The Proxy returns a fresh vi.fn() for every property access. Stand-in for
  // services this verification doesn't touch (chat, characters, providers,
  // stripe, admin-flux-grants, user-deletion, ttsMeter). If a test exercises
  // one of these and starts getting `undefined is not a function` errors,
  // wire in a real instance instead of widening this stub.
  const stub: any = new Proxy({}, { get: () => vi.fn(async () => undefined) })

  const env: any = {
    API_SERVER_URL: 'http://localhost:3000',
    OTEL_SERVICE_NAME: 'airi-server-test',
    ADDITIONAL_TRUSTED_ORIGINS: '',
    HOST: '127.0.0.1',
    PORT: 0,
  }

  const { app } = await buildApp({
    auth,
    db,
    characterService: stub,
    chatService: stub,
    providerService: stub,
    fluxService,
    fluxTransactionService: stub,
    stripeService: stub,
    billingService,
    adminFluxGrantsService,
    adminUsersService: stub,
    ttsMeter: stub,
    requestLogService: { logRequest: vi.fn(async () => undefined) } as any,
    configKV,
    redis,
    env,
    otel: null,
    userDeletionService,
    llmRouter: {
      route: vi.fn(async () => new Response('{}', { status: 200 })),
      invalidateConfig: vi.fn(),
    } as any,
  })

  return {
    app,
    db,
    schema,
    redisStore,
    configStore,
    userDeletionService,
    fluxService,
    setSessionUser(user: SessionUser | null) {
      activeSession = user
        ? {
            user: {
              id: user.id,
              email: user.email,
              name: user.name ?? user.id,
              emailVerified: user.emailVerified ?? true,
              role: user.role ?? null,
              banned: false,
              banExpires: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            session: {
              id: `sess-${user.id}`,
              userId: user.id,
              token: `tok-${user.id}`,
              createdAt: new Date(),
              updatedAt: new Date(),
              expiresAt: new Date(Date.now() + 3600_000),
              ipAddress: null,
              userAgent: null,
            },
          }
        : null
    },
    async seedUser(opts: SeedUserOptions) {
      await db.insert(schema.user).values({
        id: opts.id,
        name: opts.id,
        email: opts.email ?? `${opts.id}@example.com`,
        emailVerified: true,
      }).onConflictDoNothing()
      await db.insert(schema.userFlux).values({
        userId: opts.id,
        flux: opts.balance,
      }).onConflictDoNothing()
      // NOTICE:
      // Prime the Redis cache so `fluxService.getFlux()` reads the seeded
      // balance directly instead of touching the DB-init path (which would
      // create an `initial` flux_transaction row and skew ledger assertions).
      redisStore.set(userFluxRedisKey(opts.id), String(opts.balance))
    },
    setConfig(kv: Record<string, any>) {
      Object.assign(configStore, kv)
    },
  }
}
