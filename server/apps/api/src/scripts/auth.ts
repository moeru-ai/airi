import process from 'node:process'

import { createAuth } from '../libs/auth'
import { createDrizzle } from '../libs/db'
import { parseEnv } from '../libs/env'

const env = parseEnv(process.env)

// NOTICE:
// `better-auth generate` only introspects the auth instance's schema — it never
// fires the email callbacks. Pass no EmailService; createAuth's email-aware
// callbacks throw if invoked, but introspection never reaches them.
export default createAuth(createDrizzle(env).db, env)
