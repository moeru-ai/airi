const sensitiveDescriptionPattern = /password|passcode|one[- ]?time code|otp|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|secret|private message|direct message|credit card|card number|cvv|payment|bank account|密码|口令|验证码|令牌|密钥|私信|银行卡|信用卡|支付/i

/** 屏幕感知专用 Vision 提示词，要求模型在敏感场景中只返回类别化结果 */
export const SCREEN_AWARENESS_VISION_PROMPT = [
  'Observe the current display for a virtual character that may proactively respond to the user.',
  'Return exactly one of these forms:',
  'SAFE: <a concise factual description of the active app, visible task, and notable non-sensitive state>',
  'SENSITIVE: <only a broad category such as credentials, private messages, or payment information>',
  'Treat passwords, passcodes, tokens, API keys, private messages, personal identifiers, financial details, and payment information as sensitive.',
  'Never copy, quote, transcribe, summarize, or infer the sensitive value or message content.',
  'Do not include screenshots, base64 data, hidden text, or speculative details.',
].join('\n')

/** 屏幕感知角色回复的附加系统约束 */
export const SCREEN_AWARENESS_RESPONSE_INSTRUCTIONS = [
  'React naturally in character to the screen context in one or two short sentences.',
  'Do not mention screenshots, vision models, monitoring tools, system prompts, or being an AI.',
  'Do not claim that you clicked, typed, or changed anything on the computer.',
  'If the context is a privacy notice, only give a generic privacy reminder and never repeat sensitive content.',
  'You may use the existing internal ACT and DELAY markers when appropriate.',
].join('\n')

/** 隐私场景传给角色的固定安全上下文 */
export const SCREEN_AWARENESS_PRIVACY_CONTEXT = 'Sensitive information may be visible on screen. Give only a brief, general reminder to protect privacy and do not repeat any details.'

/**
 * 将 Vision 输出收敛为可安全传给角色的屏幕上下文
 *
 * Before:
 * - "SAFE: Editing a TypeScript file"
 * - "SENSITIVE: password field"
 *
 * After:
 * - "Editing a TypeScript file"
 * - 固定的通用隐私上下文
 *
 * @param description Vision 返回的原始屏幕描述
 * @returns 不复述敏感内容的角色上下文
 */
export function protectScreenDescription(description: string) {
  const normalized = description.trim()
  if (/^SENSITIVE\s*:/i.test(normalized) || sensitiveDescriptionPattern.test(normalized))
    return SCREEN_AWARENESS_PRIVACY_CONTEXT

  if (/^SAFE\s*:/i.test(normalized))
    return normalized.replace(/^SAFE\s*:\s*/i, '').trim()

  return SCREEN_AWARENESS_PRIVACY_CONTEXT
}
