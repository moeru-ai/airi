// Load environment variables first

import * as process from 'node:process'

import { Router } from 'express'

import { createApp } from './server'

import 'dotenv/config'

const port = process.env.PORT ?? '3001'

const app = createApp()

app.listen(port, () => {
  console.warn(`Memory service running on port ${port}`)
})

export const apiRouter = Router()

// Example route
apiRouter.get('/health', (req: any, res: any) => {
  res.json({ status: 'ok' })
})

// Default export
export default apiRouter
