import type { VercelRequest, VercelResponse } from '@vercel/node'

import { getConfiguration, setConfiguration } from '../_lib/memory'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    if (req.method === 'GET') {
      const config = getConfiguration()
      return res.status(200).json({ success: true, data: config })
    }

    if (req.method === 'POST') {
      const body = req.body

      if (!body) {
        return res.status(400).json({ success: false, error: 'Configuration payload is required' })
      }

      setConfiguration(body)
      return res.status(200).json({ success: true })
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }
  catch (error) {
    console.error('Error in /api/memory/config:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
