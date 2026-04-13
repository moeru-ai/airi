import type { ImageContent, TextContent } from '@modelcontextprotocol/sdk/types.js'

import type { ScreenshotArtifact } from '../types'

export function textContent(text: string): TextContent {
  return {
    type: 'text',
    text,
  }
}

export function imageContent(screenshot: ScreenshotArtifact): ImageContent {
  return {
    type: 'image',
    data: screenshot.dataBase64,
    mimeType: screenshot.mimeType,
  }
}
