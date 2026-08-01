import process from 'node:process'

import { createAuth } from './libs/auth'
import { createAuthDrizzle } from './libs/db'
import { parseAuthEnv } from './libs/env'

const env = parseAuthEnv(process.env)

// NOTICE:
// `better-auth generate` only introspects the auth instance's schema — it never
// fires the email callbacks. Pass no EmailService; createAuth's email-aware
// callbacks throw if invoked, but introspection never reaches them.
export default createAuth(createAuthDrizzle(env).db, env)
