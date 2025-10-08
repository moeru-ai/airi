import type { VercelRequest, VercelResponse } from '@vercel/node'

import { saveMessage } from '../_lib/memory'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  try {
    const body = req.body as { sessionId?: string, message?: unknown, userId?: string }

    if (!body?.sessionId || typeof body.sessionId !== 'string') {
      return res.status(400).json({ success: false, error: 'sessionId is required' })
    }

    if (!body?.message || typeof body.message !== 'object') {
      return res.status(400).json({ success: false, error: 'message payload is required' })
    }

    await saveMessage(body.sessionId, body.message as any, body.userId)

    return res.status(200).json({ success: true })
  }
  catch (error) {
    console.error('Error in /api/memory/save:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
