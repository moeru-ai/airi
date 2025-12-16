import type { VercelRequest, VercelResponse } from '@vercel/node'

import { searchSimilar } from '../_lib/memory'

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
    const body = req.body as { query?: string, userId?: string, limit?: number }

    console.info('[Memory Debug Search] 收到搜索请求:', {
      query: body?.query,
      userId: body?.userId,
      limit: body?.limit,
    })

    if (!body?.query || typeof body.query !== 'string') {
      return res.status(400).json({ success: false, error: 'query is required' })
    }

    if (!body?.userId || typeof body.userId !== 'string') {
      return res.status(400).json({ success: false, error: 'userId is required' })
    }

    const results = await searchSimilar(
      body.query,
      body.userId,
      typeof body.limit === 'number' ? body.limit : undefined,
    )

    console.info('[Memory Debug Search] 搜索结果数量:', results.length)
    console.info('[Memory Debug Search] 搜索成功，返回结果')

    return res.status(200).json({ success: true, data: results })
  }
  catch (error) {
    console.error('Error in /api/memory/search:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
