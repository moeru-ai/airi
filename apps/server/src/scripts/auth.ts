import process from 'node:process'

import { createAuth } from '../libs/auth'
import { createDrizzle } from '../libs/db'
import { parseEnv } from '../libs/env'

const env = parseEnv(process.env)
export default createAuth(createDrizzle(env.DATABASE_URL), env)
