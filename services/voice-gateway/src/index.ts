import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'

import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'

import { env } from './env'
import { createVoiceGateway } from './server'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env') })

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)

const log = useLogg('main').useGlobalConfig()

log.log('Starting voice gateway...')
createVoiceGateway(env.PORT)
