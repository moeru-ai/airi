import process from 'node:process'

import { initLogger, LoggerFormat, LoggerLevel, setGlobalHookPostLog, useLogger } from '@guiiai/logg'
import { serve } from '@hono/node-server'
import { createContainer, createLoggLogger, lifecycle, provide, resolve, start, stop } from 'injeca'

import { buildIdentityApp } from './identity-app'
import { createAuth, getTrustedClientSeedSummaries, seedTrustedClients } from './libs/auth'
import { createDrizzle, migrateDatabase } from './libs/db'
import { parseIdentityEnv } from './libs/env'
import { initializeExternalDependency } from './libs/external-dependency'
import { createRedis } from './libs/redis'
import { emitOtelLog, initOtel } from './otel'
import { registerActiveSessionsGauge } from './otel/gauges/active-sessions'
import { registerDistinctActiveUsersGauge } from './otel/gauges/distinct-active-users'
import { registerRollingActiveUsersGauge } from './otel/gauges/rolling-active-users'
import { registerTotalUsersGauge } from './otel/gauges/total-users'
import { createConfigKVService } from './services/adapters/config-kv'
import { createEmailService } from './services/adapters/email'
import { createPosthogSink } from './services/adapters/posthog'
import { createRemoteUserDeletionService } from './services/adapters/remote-user-deletion'
import { createProductEventService } from './services/domain/product-events'

/**
 * Builds the standalone identity runtime with its own dependency container.
 * Only identity infrastructure is registered here; business services remain
 * owned by the API process.
 */
export async function createIdentityServer() {
  initLogger(LoggerLevel.Debug, LoggerFormat.Pretty)
  const logger = useLogger('identity-server').useGlobalConfig()
  const container = createContainer({ logger: createLoggLogger(useLogger('injeca').useGlobalConfig()) })

  setGlobalHookPostLog((log) => {
    emitOtelLog(log.level, log.context, log.message, log.fields as Record<string, string | number | boolean>)
  })

  const env = provide(container, 'env', () => parseIdentityEnv(process.env))
  const otel = provide(container, 'libs:otel', {
    dependsOn: { env },
    build: ({ dependsOn }) => initOtel(dependsOn.env),
  })
  const db = provide(container, 'datastore:db', {
    dependsOn: { env, lifecycle },
    build: async ({ dependsOn }) => {
      const connection = await initializeExternalDependency('Database', logger, async (attempt) => {
        const candidate = createDrizzle(dependsOn.env)
        try {
          await candidate.db.execute('SELECT 1')
          logger.log(`Connected to database on attempt ${attempt}`)
          await migrateDatabase(candidate.db)
          logger.log(`Applied schema on attempt ${attempt}`)
          return candidate
        }
        catch (error) {
          await candidate.pool.end()
          throw error
        }
      })
      dependsOn.lifecycle.appHooks.onStop(() => connection.pool.end())
      return connection.db
    },
  })
  const redis = provide(container, 'datastore:redis', {
    dependsOn: { env, lifecycle },
    build: async ({ dependsOn }) => {
      const instance = await initializeExternalDependency('Redis', logger, async (attempt) => {
        const candidate = createRedis(dependsOn.env.REDIS_URL)
        try {
          await candidate.connect()
          logger.log(`Connected to Redis on attempt ${attempt}`)
          return candidate
        }
        catch (error) {
          candidate.disconnect()
          throw error
        }
      })
      dependsOn.lifecycle.appHooks.onStop(async () => {
        await instance.quit()
      })
      return instance
    },
  })
  const configKV = provide(container, 'datastore:configKV', {
    dependsOn: { redis },
    build: ({ dependsOn }) => createConfigKVService(dependsOn.redis),
  })
  const email = provide(container, 'services:email', {
    dependsOn: { env, otel },
    build: ({ dependsOn }) => createEmailService({
      apiKey: dependsOn.env.RESEND_API_KEY,
      fromEmail: dependsOn.env.RESEND_FROM_EMAIL,
      fromName: dependsOn.env.RESEND_FROM_NAME,
    }, undefined, dependsOn.otel?.email),
  })
  const posthogSink = provide(container, 'services:posthogSink', {
    dependsOn: { env, lifecycle },
    build: ({ dependsOn }) => {
      if (!dependsOn.env.POSTHOG_PROJECT_KEY)
        return null
      const sink = createPosthogSink({
        projectKey: dependsOn.env.POSTHOG_PROJECT_KEY,
        host: dependsOn.env.POSTHOG_API_HOST,
      })
      dependsOn.lifecycle.appHooks.onStop(() => sink.shutdown())
      return sink
    },
  })
  const productEvents = provide(container, 'services:productEvents', {
    dependsOn: { db, otel, posthogSink },
    build: ({ dependsOn }) => createProductEventService(dependsOn.db, dependsOn.otel?.product, dependsOn.posthogSink),
  })
  const userDeletion = provide(container, 'services:userDeletion', {
    dependsOn: { env },
    build: ({ dependsOn }) => createRemoteUserDeletionService(dependsOn.env),
  })
  const auth = provide(container, 'services:auth', {
    dependsOn: { db, env, email, otel, productEvents, userDeletion },
    build: async ({ dependsOn }) => {
      await seedTrustedClients(dependsOn.db, dependsOn.env)
      for (const client of getTrustedClientSeedSummaries(dependsOn.env)) {
        logger.withFields({
          clientId: client.clientId,
          clientName: client.name,
          redirectUris: client.redirectUris.join(', '),
        }).log('OIDC trusted client ready')
      }
      return createAuth(
        dependsOn.db,
        dependsOn.env,
        dependsOn.email,
        dependsOn.otel?.auth,
        dependsOn.userDeletion,
        dependsOn.productEvents,
      )
    },
  })

  await start(container)
  const dependencies = await resolve(container, { auth, db, redis, env, configKV, otel })

  if (dependencies.otel) {
    registerTotalUsersGauge(dependencies.otel.auth.totalUsers, dependencies.db, dependencies.otel.observability.metricReadErrors)
    registerActiveSessionsGauge(dependencies.otel.auth.activeSessions, dependencies.db, dependencies.otel.observability.metricReadErrors)
    registerDistinctActiveUsersGauge(dependencies.otel.auth.distinctActiveUsers, dependencies.db, dependencies.otel.observability.metricReadErrors)
    registerRollingActiveUsersGauge(dependencies.otel.auth.rollingActiveUsers, dependencies.db, dependencies.otel.observability.metricReadErrors)
  }

  const { app } = await buildIdentityApp({
    auth: dependencies.auth,
    db: dependencies.db,
    redis: dependencies.redis,
    env: dependencies.env,
    configKV: dependencies.configKV,
    rateLimitMetrics: dependencies.otel?.rateLimit,
  })

  return {
    app,
    hostname: dependencies.env.HOST,
    port: dependencies.env.PORT,
    stop: () => stop(container),
  }
}

function handleProcessError(error: unknown, type: string) {
  useLogger().withError(error).error(type)
}

/**
 * Starts the dedicated Identity HTTP process and owns its shutdown lifecycle.
 *
 * Call stack:
 *
 * runIdentityServer
 *   -> {@link createIdentityServer}
 *     -> {@link buildIdentityApp}
 *       -> Better Auth / OIDC routes
 */
export async function runIdentityServer(): Promise<void> {
  const runtime = await createIdentityServer()
  const server = serve({ fetch: runtime.app.fetch, port: runtime.port, hostname: runtime.hostname })

  process.on('uncaughtException', error => handleProcessError(error, 'Uncaught exception'))
  process.on('unhandledRejection', error => handleProcessError(error, 'Unhandled rejection'))

  await new Promise<void>((resolvePromise, reject) => {
    server.once('close', () => resolvePromise())
    server.once('error', error => reject(error))
  }).finally(runtime.stop)
}
