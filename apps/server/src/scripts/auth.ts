import process from 'node:process'

import { createAuth } from '../libs/auth'
import { createDrizzle } from '../libs/db'
import { parseEnv } from '../libs/env'
import { createEmailService } from '../services/email'
import { createS3StorageService } from '../services/s3'

const env = parseEnv(process.env)
export default createAuth(createDrizzle(env).db, env, createEmailService(env), createS3StorageService(env))
