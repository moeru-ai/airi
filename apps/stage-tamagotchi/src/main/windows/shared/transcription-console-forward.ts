import type { BrowserWindow } from 'electron'

const TRANSCRIPTION_KEYWORDS = [
  '[hearing pipeline]',
  'transcription',
  'transcribed',
  'web speech api',
]

function isTranscriptionMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return TRANSCRIPTION_KEYWORDS.some(keyword => normalized.includes(keyword))
}

function consoleLevelLabel(level: number): string {
  switch (level) {
    case 0:
      return 'verbose'
    case 1:
      return 'info'
    case 2:
      return 'warn'
    case 3:
      return 'error'
    default:
      return 'log'
  }
}

export function setupTranscriptionConsoleForward(window: BrowserWindow, windowTag: string) {
  // NOTICE: Forward renderer transcription logs to terminal output so users can inspect
  // STT behavior without opening renderer devtools.
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (!isTranscriptionMessage(message))
      return

    console.info(
      `[Renderer:${windowTag}:${consoleLevelLabel(level)}][Transcription] ${message} (${sourceId}:${line})`,
    )
  })
}
