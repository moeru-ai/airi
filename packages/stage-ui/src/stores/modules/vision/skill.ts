export type VisionCaptureInputMode = 'screenshot' | 'recording'
export type VisionScreenshotCallMethod = 'canvas' | 'image-capture'
export type VisionRecordingCallMethod = 'media-recorder' | 'frame-sampler'

export interface VisionScreenRecognitionSkillPromptConfig {
  enabled: boolean
  provider: string
  model: string
  captureInputMode: VisionCaptureInputMode
  screenshotCallMethod: VisionScreenshotCallMethod
  recordingCallMethod: VisionRecordingCallMethod
  recordingDurationMs: number
}

const screenshotMethodLabelMap: Record<VisionScreenshotCallMethod, string> = {
  'canvas': 'Canvas drawImage snapshot',
  'image-capture': 'ImageCapture grabFrame',
}

const recordingMethodLabelMap: Record<VisionRecordingCallMethod, string> = {
  'media-recorder': 'MediaRecorder short clip',
  'frame-sampler': 'Frame sampler fallback',
}

export function buildVisionScreenRecognitionSkillPrompt(config: VisionScreenRecognitionSkillPromptConfig) {
  const enabledText = config.enabled ? 'enabled' : 'disabled'
  const providerText = config.provider || 'not configured'
  const modelText = config.model || 'not configured'
  const captureModeText = config.captureInputMode === 'recording' ? 'recording' : 'screenshot'
  const screenshotMethodText = screenshotMethodLabelMap[config.screenshotCallMethod]
  const recordingMethodText = recordingMethodLabelMap[config.recordingCallMethod]
  const recordingDurationText = `${Math.max(250, Math.round(config.recordingDurationMs))}ms`

  return [
    '[Skill: Screen Vision Recognition]',
    `Status: ${enabledText}.`,
    `Vision model provider: ${providerText}.`,
    `Vision model: ${modelText}.`,
    `Capture input mode: ${captureModeText}.`,
    `Screenshot call method: ${screenshotMethodText}.`,
    `Recording call method: ${recordingMethodText} (${recordingDurationText}).`,
    'Behavior rules:',
    '- When users ask to understand on-screen content, use this skill before answering details.',
    '- If status is disabled or provider/model is not configured, tell users to enable Vision screen recognition and configure provider/model in Settings > Modules > Vision.',
    '- Keep vision outputs factual and concise, and mention uncertainty when the frame is unclear.',
  ].join('\n')
}
