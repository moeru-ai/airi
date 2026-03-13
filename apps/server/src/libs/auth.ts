import type { Database } from './db'
import type { Env } from './env'
import type { AuthMetrics } from './otel'

import { useLogger } from '@guiiai/logg'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { bearer } from 'better-auth/plugins'

import * as authSchema from '../schemas/accounts'

export function createAuth(db: Database, env: Env, metrics?: AuthMetrics | null) {
  const logger = useLogger('auth').useGlobalConfig()

  const socialProviders: Record<string, any> = {}

  if (env.AUTH_GOOGLE_CLIENT_ID && env.AUTH_GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.AUTH_GOOGLE_CLIENT_ID,
      clientSecret: env.AUTH_GOOGLE_CLIENT_SECRET,
    }
  }
  else {
    logger.warn('Google OAuth not configured — provider disabled')
  }

  if (env.AUTH_GITHUB_CLIENT_ID && env.AUTH_GITHUB_CLIENT_SECRET) {
    socialProviders.github = {
      clientId: env.AUTH_GITHUB_CLIENT_ID,
      clientSecret: env.AUTH_GITHUB_CLIENT_SECRET,
    }
  }
  else {
    logger.warn('GitHub OAuth not configured — provider disabled')
  }

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        ...authSchema,
      },
    }),

    plugins: [
      bearer(),
    ],

    emailAndPassword: {
      enabled: true,
    },

    baseURL: env.API_SERVER_URL,
    trustedOrigins: ['*'],

    // To skip state-mismatch errors
    // https://github.com/better-auth/better-auth/issues/4969#issuecomment-3397804378
    advanced: {
      defaultCookieAttributes: {
        sameSite: 'None', // this enables cross-site cookies
        secure: true, // required for SameSite=None
      },
    },

    ...(Object.keys(socialProviders).length > 0 ? { socialProviders } : {}),

    databaseHooks: {
      user: {
        create: {
          after: async () => {
            metrics?.userRegistered.add(1)
          },
        },
      },
      session: {
        create: {
          after: async () => {
            metrics?.userLogin.add(1)
            metrics?.activeSessions.add(1)
          },
        },
        delete: {
          after: async () => {
            metrics?.activeSessions.add(-1)
          },
        },
      },
    },
  })
}
