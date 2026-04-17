/**
 * Better-auth-managed account tables (drizzle-pg).
 *
 * Use when:
 * - Better-auth or any of its plugins (jwt, oauth-provider) need to read or
 *   write user, session, account, verification, JWKS, or OIDC tables.
 *
 * Expects:
 * - This file stays as close as possible to the output of
 *   `npx @better-auth/cli generate` so it can be safely regenerated. Pure
 *   table definitions only — no relations, no app-side helpers.
 *
 * Where to put related code:
 * - Drizzle relations for these tables → `accounts-extensions.ts`.
 * - The `deletedAt` column on `user` is declared as a better-auth
 *   `additionalFields` entry in `libs/auth.ts`, so the CLI keeps it in
 *   sync on regeneration.
 */

import { boolean, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  // NOTICE:
  // `deletedAt` is registered with better-auth via
  // `user.additionalFields.deletedAt` in `libs/auth.ts`. Keeping the
  // declaration in sync there ensures `@better-auth/cli generate` will
  // continue to emit this column when accounts.ts is regenerated.
  // Removal condition: only if soft-delete is replaced by a hard-delete flow.
  deletedAt: timestamp('deleted_at'),
})

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  table => [index('session_userId_idx').on(table.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  table => [index('account_userId_idx').on(table.userId)],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  table => [index('verification_identifier_idx').on(table.identifier)],
)

export const jwks = pgTable('jwks', {
  id: text('id').primaryKey(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  createdAt: timestamp('created_at').notNull(),
  expiresAt: timestamp('expires_at'),
})

export const oauthClient = pgTable('oauth_client', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().unique(),
  clientSecret: text('client_secret'),
  disabled: boolean('disabled').default(false),
  skipConsent: boolean('skip_consent'),
  enableEndSession: boolean('enable_end_session'),
  subjectType: text('subject_type'),
  scopes: text('scopes').array(),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
  name: text('name'),
  uri: text('uri'),
  icon: text('icon'),
  contacts: text('contacts').array(),
  tos: text('tos'),
  policy: text('policy'),
  softwareId: text('software_id'),
  softwareVersion: text('software_version'),
  softwareStatement: text('software_statement'),
  redirectUris: text('redirect_uris').array().notNull(),
  postLogoutRedirectUris: text('post_logout_redirect_uris').array(),
  tokenEndpointAuthMethod: text('token_endpoint_auth_method'),
  grantTypes: text('grant_types').array(),
  responseTypes: text('response_types').array(),
  public: boolean('public'),
  type: text('type'),
  requirePKCE: boolean('require_pkce'),
  referenceId: text('reference_id'),
  metadata: jsonb('metadata'),
})

export const oauthRefreshToken = pgTable('oauth_refresh_token', {
  id: text('id').primaryKey(),
  token: text('token').notNull(),
  clientId: text('client_id')
    .notNull()
    .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
  sessionId: text('session_id').references(() => session.id, {
    onDelete: 'set null',
  }),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  referenceId: text('reference_id'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at'),
  revoked: timestamp('revoked'),
  authTime: timestamp('auth_time'),
  scopes: text('scopes').array().notNull(),
})

export const oauthAccessToken = pgTable('oauth_access_token', {
  id: text('id').primaryKey(),
  token: text('token').unique(),
  clientId: text('client_id')
    .notNull()
    .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
  sessionId: text('session_id').references(() => session.id, {
    onDelete: 'set null',
  }),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
  referenceId: text('reference_id'),
  refreshId: text('refresh_id').references(() => oauthRefreshToken.id, {
    onDelete: 'cascade',
  }),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at'),
  scopes: text('scopes').array().notNull(),
})

export const oauthConsent = pgTable('oauth_consent', {
  id: text('id').primaryKey(),
  clientId: text('client_id')
    .notNull()
    .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
  referenceId: text('reference_id'),
  scopes: text('scopes').array().notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
})
