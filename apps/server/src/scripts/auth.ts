import process from 'node:process'

import { createAuth } from '../services/auth'
import { createDrizzle } from '../services/db'
import { parseEnv } from '../services/env'


const env = parseEnv(process.env)
export default createAuth(createDrizzle(env.DATABASE_URL), env)
