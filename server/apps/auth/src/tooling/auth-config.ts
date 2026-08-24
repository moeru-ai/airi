import process from 'node:process'

import { createAuth } from '../auth'
import { createAuthDrizzle } from '../db'
import { parseAuthEnv } from '../env'

const env = parseAuthEnv(process.env)

// NOTICE:
// `better-auth generate` only introspects the auth instance's schema — it never
// fires the email callbacks. Pass no EmailService; createAuth's email-aware
// callbacks throw if invoked, but introspection never reaches them.
export default createAuth(createAuthDrizzle(env).db, env)
