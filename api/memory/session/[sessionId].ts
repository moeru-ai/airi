import type { VercelRequest, VercelResponse } from '@vercel/node'

import { getRecentMessages } from '@proj-airi/server-runtime/services/memory'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  try {
    const { sessionId } = req.query

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ success: false, error: 'sessionId is required' })
    }

    const limitParam = req.query.limit as string | undefined
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined

    const messages = await getRecentMessages(sessionId, Number.isNaN(limit) ? undefined : limit)

    return res.status(200).json({ success: true, data: messages })
  }
  catch (error) {
    console.error('Error in /api/memory/session/[sessionId]:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
