import { relations } from 'drizzle-orm'
import { boolean, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const user = pgTable('user', {
  banExpires: timestamp('ban_expires'),
  // Account-ban fields are owned by the private management backend. banGuard
  // rejects banned users during session creation. Resource and userinfo routes
  // re-check these fields for existing OIDC access tokens.
  banned: boolean('banned').default(false),
  banReason: text('ban_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  id: text('id').primaryKey(),
  image: text('image'),
  lastSeenAt: timestamp('last_seen_at'),
  name: text('name').notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
})

export const session = pgTable(
  'session',
  {
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    id: text('id').primaryKey(),
    ipAddress: text('ip_address'),
    token: text('token').notNull().unique(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  table => [
    index('session_userId_idx').on(table.userId),
    index('session_expires_at_idx').on(table.expiresAt),
  ],
)

export const account = pgTable(
  'account',
  {
    accessToken: text('access_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    accountId: text('account_id').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    id: text('id').primaryKey(),
    idToken: text('id_token'),
    password: text('password'),
    providerId: text('provider_id').notNull(),
    refreshToken: text('refresh_token'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  table => [
    index('account_userId_idx').on(table.userId),
    index('account_account_id_provider_id_idx').on(table.accountId, table.providerId),
  ],
)

export const verification = pgTable(
  'verification',
  {
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    value: text('value').notNull(),
  },
  table => [index('verification_identifier_idx').on(table.identifier)],
)

export const jwks = pgTable('jwks', {
  createdAt: timestamp('created_at').notNull(),
  expiresAt: timestamp('expires_at'),
  id: text('id').primaryKey(),
  privateKey: text('private_key').notNull(),
  publicKey: text('public_key').notNull(),
})

export const oauthClient = pgTable('oauth_client', {
  clientId: text('client_id').notNull().unique(),
  clientSecret: text('client_secret'),
  contacts: text('contacts').array(),
  createdAt: timestamp('created_at'),
  disabled: boolean('disabled').default(false),
  enableEndSession: boolean('enable_end_session'),
  grantTypes: text('grant_types').array(),
  icon: text('icon'),
  id: text('id').primaryKey(),
  metadata: jsonb('metadata'),
  name: text('name'),
  policy: text('policy'),
  postLogoutRedirectUris: text('post_logout_redirect_uris').array(),
  public: boolean('public'),
  redirectUris: text('redirect_uris').array().notNull(),
  referenceId: text('reference_id'),
  requirePKCE: boolean('require_pkce'),
  responseTypes: text('response_types').array(),
  scopes: text('scopes').array(),
  skipConsent: boolean('skip_consent'),
  softwareId: text('software_id'),
  softwareStatement: text('software_statement'),
  softwareVersion: text('software_version'),
  subjectType: text('subject_type'),
  tokenEndpointAuthMethod: text('token_endpoint_auth_method'),
  tos: text('tos'),
  type: text('type'),
  updatedAt: timestamp('updated_at'),
  uri: text('uri'),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
})

export const oauthRefreshToken = pgTable(
  'oauth_refresh_token',
  {
    authTime: timestamp('auth_time'),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at'),
    expiresAt: timestamp('expires_at'),
    id: text('id').primaryKey(),
    referenceId: text('reference_id'),
    revoked: timestamp('revoked'),
    scopes: text('scopes').array().notNull(),
    sessionId: text('session_id').references(() => session.id, {
      onDelete: 'set null',
    }),
    token: text('token').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  table => [
    index('oauth_refresh_token_token_idx').on(table.token),
    index('oauth_refresh_token_user_id_idx').on(table.userId),
    index('oauth_refresh_token_session_id_idx').on(table.sessionId),
    index('oauth_refresh_token_client_id_idx').on(table.clientId),
  ],
)

export const oauthAccessToken = pgTable('oauth_access_token', {
  clientId: text('client_id')
    .notNull()
    .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at'),
  expiresAt: timestamp('expires_at'),
  id: text('id').primaryKey(),
  referenceId: text('reference_id'),
  refreshId: text('refresh_id').references(() => oauthRefreshToken.id, {
    onDelete: 'cascade',
  }),
  scopes: text('scopes').array().notNull(),
  sessionId: text('session_id').references(() => session.id, {
    onDelete: 'set null',
  }),
  token: text('token').unique(),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
})

export const oauthConsent = pgTable('oauth_consent', {
  clientId: text('client_id')
    .notNull()
    .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at'),
  id: text('id').primaryKey(),
  referenceId: text('reference_id'),
  scopes: text('scopes').array().notNull(),
  updatedAt: timestamp('updated_at'),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
})

export const userRelations = relations(user, ({ many }) => ({
  accounts: many(account),
  oauthAccessTokens: many(oauthAccessToken),
  oauthClients: many(oauthClient),
  oauthConsents: many(oauthConsent),
  oauthRefreshTokens: many(oauthRefreshToken),
  sessions: many(session),
}))

export const sessionRelations = relations(session, ({ many, one }) => ({
  oauthAccessTokens: many(oauthAccessToken),
  oauthRefreshTokens: many(oauthRefreshToken),
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}))

export const oauthClientRelations = relations(oauthClient, ({ many, one }) => ({
  oauthAccessTokens: many(oauthAccessToken),
  oauthConsents: many(oauthConsent),
  oauthRefreshTokens: many(oauthRefreshToken),
  user: one(user, {
    fields: [oauthClient.userId],
    references: [user.id],
  }),
}))

export const oauthRefreshTokenRelations = relations(
  oauthRefreshToken,
  ({ many, one }) => ({
    oauthAccessTokens: many(oauthAccessToken),
    oauthClient: one(oauthClient, {
      fields: [oauthRefreshToken.clientId],
      references: [oauthClient.clientId],
    }),
    session: one(session, {
      fields: [oauthRefreshToken.sessionId],
      references: [session.id],
    }),
    user: one(user, {
      fields: [oauthRefreshToken.userId],
      references: [user.id],
    }),
  }),
)

export const oauthAccessTokenRelations = relations(
  oauthAccessToken,
  ({ one }) => ({
    oauthClient: one(oauthClient, {
      fields: [oauthAccessToken.clientId],
      references: [oauthClient.clientId],
    }),
    oauthRefreshToken: one(oauthRefreshToken, {
      fields: [oauthAccessToken.refreshId],
      references: [oauthRefreshToken.id],
    }),
    session: one(session, {
      fields: [oauthAccessToken.sessionId],
      references: [session.id],
    }),
    user: one(user, {
      fields: [oauthAccessToken.userId],
      references: [user.id],
    }),
  }),
)

export const oauthConsentRelations = relations(oauthConsent, ({ one }) => ({
  oauthClient: one(oauthClient, {
    fields: [oauthConsent.clientId],
    references: [oauthClient.clientId],
  }),
  user: one(user, {
    fields: [oauthConsent.userId],
    references: [user.id],
  }),
}))
