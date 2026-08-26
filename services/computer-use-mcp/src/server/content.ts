import type { ImageContent, TextContent } from '@modelcontextprotocol/sdk/types.js'

import type { ScreenshotArtifact } from '../types'

export function imageContent(screenshot: ScreenshotArtifact): ImageContent {
  return {
    data: screenshot.dataBase64,
    mimeType: screenshot.mimeType,
    type: 'image',
  }
}

export function textContent(text: string): TextContent {
  return {
    text,
    type: 'text',
  }
}
