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

    console.info('[Memory Debug API] 收到保存请求:', {
      sessionId: body?.sessionId,
      userId: body?.userId,
      messageKeys: body?.message ? Object.keys(body.message) : 'none',
      messageRole: (body?.message as any)?.role,
      messageContent: typeof (body?.message as any)?.content === 'string' ? `${(body?.message as any).content.substring(0, 100)}...` : 'non-string',
      hasPersistLongTerm: !!(body?.message as any)?.metadata?.persistLongTerm,
      persistLongTermValue: (body?.message as any)?.metadata?.persistLongTerm,
    })

    if (!body?.sessionId || typeof body.sessionId !== 'string') {
      return res.status(400).json({ success: false, error: 'sessionId is required' })
    }

    if (!body?.message || typeof body.message !== 'object') {
      return res.status(400).json({ success: false, error: 'message payload is required' })
    }

    await saveMessage(body.sessionId, body.message as any, body.userId)

    console.info('[Memory Debug API] 消息保存成功')

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
