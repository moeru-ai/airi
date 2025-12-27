import type { Emotion } from '../constants/emotions'
import { Emotion as EmotionEnum } from '../constants/emotions'

export interface EmotionDetectionResult {
  emotion: Emotion | null
  confidence: number
  reason?: string
}

/**
 * Semantic patterns for detecting emotions from text
 * Uses keyword matching, punctuation patterns, and contextual clues
 */
const EMOTION_PATTERNS: Record<Emotion, {
  keywords: string[]
  patterns: RegExp[]
  weight: number
}> = {
  [EmotionEnum.Happy]: {
    keywords: [
      // English
      'happy', 'joy', 'excited', 'glad', 'pleased', 'delighted', 'cheerful', 'great', 'wonderful', 'awesome', 'amazing',
      'love', 'loved', 'loving', 'giggle', 'giggles', 'smile', 'smiles', 'laugh', 'laughs', 'yay', 'yeah', 'yes',
      'fantastic', 'brilliant', 'perfect', 'excellent', 'super', 'cool', 'nice', 'good', 'better', 'best',
      // Chinese
      '开心', '高兴', '快乐', '兴奋', '激动', '喜欢', '爱', '哈哈', '嘻嘻', '嘿嘿', '太好了', '太棒了', '好棒',
      '好开心', '好高兴', '超开心', '超高兴', '太开心', '太高兴', '好喜欢', '超喜欢', '太喜欢',
      // Japanese
      '嬉しい', '楽しい', '好き', '大好き', '最高', 'やった', 'わーい',
    ],
    patterns: [
      /!{2,}/g, // Multiple exclamation marks
      /^[A-Z\s!]{10,}$/g, // All caps with exclamations
      /(haha|hehe|hihi|yay|woohoo)/gi,
      /(^|\s)(yes|yeah|yep|yup)(\s|$|!)/gi,
    ],
    weight: 1.0,
  },
  [EmotionEnum.Sad]: {
    keywords: [
      // English
      'sad', 'sadness', 'unhappy', 'upset', 'disappointed', 'disappointing', 'sorry', 'sorrow', 'grief', 'grieving',
      'cry', 'crying', 'tears', 'tearful', 'depressed', 'depressing', 'lonely', 'alone', 'miss', 'missing',
      'bad', 'worse', 'worst', 'terrible', 'awful', 'horrible', 'sucks', 'sadly',
      // Chinese
      '难过', '伤心', '悲伤', '沮丧', '失望', '抱歉', '对不起', '哭', '哭泣', '眼泪', '孤独', '寂寞', '想念',
      '太难过', '好难过', '好伤心', '太伤心', '好失望', '太失望',
      // Japanese
      '悲しい', '寂しい', '残念', '泣きたい', 'さみしい',
    ],
    patterns: [
      /(\.{3,}|…)/g, // Ellipses (often indicate sadness)
      /(sigh|sighs|sighed)/gi,
      /(^|\s)(no|nope|nah)(\s|$|\.)/gi,
    ],
    weight: 1.0,
  },
  [EmotionEnum.Angry]: {
    keywords: [
      // English
      'angry', 'anger', 'mad', 'annoyed', 'annoying', 'frustrated', 'frustrating', 'irritated', 'irritating',
      'upset', 'upsetting', 'hate', 'hated', 'hating', 'disgusted', 'disgusting', 'rage', 'raging', 'furious',
      'outraged', 'outrageous', 'stupid', 'idiot', 'dumb', 'ridiculous', 'absurd', 'nonsense',
      // Chinese
      '生气', '愤怒', '恼火', '烦躁', '讨厌', '厌恶', '恨', '讨厌', '烦', '烦人', '气死', '气死了',
      '太生气了', '好生气', '太愤怒', '好愤怒', '太烦了', '好烦',
      // Japanese
      '怒る', '怒り', 'イライラ', 'ムカつく', '嫌い',
    ],
    patterns: [
      /[A-Z]{5,}/g, // All caps (often indicates anger)
      /!{3,}/g, // Multiple exclamation marks
      /(ugh|argh|grr|hmpf)/gi,
    ],
    weight: 1.0,
  },
  [EmotionEnum.Think]: {
    keywords: [
      // English
      'think', 'thinking', 'thought', 'thoughts', 'consider', 'considering', 'wonder', 'wondering', 'ponder',
      'pondering', 'reflect', 'reflecting', 'contemplate', 'contemplating', 'maybe', 'perhaps', 'might', 'could',
      'possibly', 'probably', 'likely', 'unlikely', 'hmm', 'hmmm', 'well', 'let me think', 'i think', 'i guess',
      // Chinese
      '想', '思考', '考虑', '想想', '想想看', '思考一下', '考虑一下', '也许', '可能', '或许', '大概', '应该',
      '我觉得', '我想', '我认为', '我觉得', '可能', '也许', '嗯', '嗯嗯', '呃', '那个',
      // Japanese
      '考える', '思う', '思っている', 'かもしれない', 'かも', '多分', 'うーん', 'えーと',
    ],
    patterns: [
      /(\.{2,}|…)/g, // Ellipses (often indicate thinking)
      /(hmm|hmmm|um|uh|er|well)/gi,
      /(let me|i think|i guess|i suppose|maybe|perhaps)/gi,
      /\?(.*)\?/g, // Question marks indicating uncertainty
    ],
    weight: 0.8,
  },
  [EmotionEnum.Surprise]: {
    keywords: [
      // English
      'surprised', 'surprise', 'surprising', 'shocked', 'shocking', 'amazed', 'amazing', 'astonished', 'astonishing',
      'wow', 'whoa', 'woah', 'oh', 'oh my', 'omg', 'oh my god', 'really', 'seriously', 'no way', 'unbelievable',
      'incredible', 'unexpected', 'suddenly', 'sudden',
      // Chinese
      '惊讶', '吃惊', '震惊', '意外', '没想到', '居然', '竟然', '真的', '真的吗', '不会吧', '天啊', '天哪',
      '太惊讶了', '好惊讶', '太震惊了', '好震惊',
      // Japanese
      '驚いた', 'びっくり', 'まさか', '本当', 'マジ', 'えっ', 'うそ',
    ],
    patterns: [
      /(wow|whoa|woah|omg|oh my)/gi,
      /\?{2,}/g, // Multiple question marks
      /(no way|seriously|really\?)/gi,
    ],
    weight: 1.0,
  },
  [EmotionEnum.Awkward]: {
    keywords: [
      // English
      'awkward', 'embarrassed', 'embarrassing', 'uncomfortable', 'uncomfortably', 'weird', 'weirdly', 'strange',
      'strangely', 'odd', 'oddly', 'unusual', 'unusually', 'unexpected', 'unexpectedly', 'oops', 'oopsie',
      'sorry', 'my bad', 'my mistake', 'whoops', 'uh oh',
      // Chinese
      '尴尬', '窘迫', '不好意思', '抱歉', '对不起', '奇怪', '怪异', '不对劲', '不太对', '有点怪',
      '好尴尬', '太尴尬了', '好奇怪', '太奇怪了',
      // Japanese
      '恥ずかしい', '変', 'おかしい', '失礼', 'ごめん',
    ],
    patterns: [
      /(oops|whoops|uh oh|my bad)/gi,
      /(sorry|apologize|apology)/gi,
      /(awkward|weird|strange|odd)/gi,
    ],
    weight: 0.9,
  },
  [EmotionEnum.Question]: {
    keywords: [
      // English
      'what', 'why', 'how', 'when', 'where', 'who', 'which', 'question', 'questions', 'ask', 'asking', 'asked',
      'wonder', 'wondering', 'curious', 'curiosity', 'inquire', 'inquiry',
      // Chinese
      '什么', '为什么', '怎么', '如何', '何时', '哪里', '谁', '哪个', '问题', '疑问', '好奇', '想知道',
      '问', '询问', '请问',
      // Japanese
      '何', 'なぜ', 'どう', 'いつ', 'どこ', '誰', 'どれ', '質問', '聞く',
    ],
    patterns: [
      /\?/g, // Question marks
      /^(what|why|how|when|where|who|which)/gi, // Questions starting with question words
      /(i wonder|i'm wondering|do you know|can you tell)/gi,
    ],
    weight: 0.7,
  },
  [EmotionEnum.Curious]: {
    keywords: [
      // English
      'curious', 'curiosity', 'curiously', 'interested', 'interesting', 'intrigued', 'intriguing', 'wonder',
      'wondering', 'want to know', 'would like to know', 'tell me', 'explain', 'what is', 'what are', 'how does',
      'how do', 'why is', 'why are', 'interesting', 'fascinating', 'fascinated',
      // Chinese
      '好奇', '感兴趣', '想知道', '想了解', '想问问', '告诉我', '解释一下', '说明一下', '什么', '怎么',
      '为什么', '如何', '好想知道', '很好奇', '太好奇了',
      // Japanese
      '興味', '知りたい', '教えて', '説明', 'どうして', 'なぜ',
    ],
    patterns: [
      /(tell me|explain|what is|what are|how does|how do|why is|why are)/gi,
      /(i want to know|i'd like to know|i'm curious)/gi,
      /\?.*\?/g, // Multiple questions
    ],
    weight: 0.8,
  },
  [EmotionEnum.Idle]: {
    keywords: [],
    patterns: [],
    weight: 0.0, // Neutral/default emotion
  },
}

/**
 * Detects emotion from text using semantic analysis
 * Returns the most likely emotion with confidence score
 */
export function detectEmotionFromText(text: string): EmotionDetectionResult {
  if (!text || text.trim().length === 0) {
    return {
      emotion: EmotionEnum.Idle,
      confidence: 0.0,
      reason: 'Empty text',
    }
  }

  const normalizedText = text.toLowerCase().trim()
  const scores: Map<Emotion, { score: number, reasons: string[] }> = new Map()

  // Initialize scores
  for (const emotion of Object.values(EmotionEnum)) {
    scores.set(emotion, { score: 0, reasons: [] })
  }

  // Score each emotion based on patterns
  for (const [emotion, config] of Object.entries(EMOTION_PATTERNS)) {
    const emotionKey = emotion as Emotion
    const emotionData = scores.get(emotionKey)!

    // Check keywords
    for (const keyword of config.keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi')
      const matches = normalizedText.match(regex)
      if (matches) {
        const keywordScore = (matches.length * config.weight) / Math.max(normalizedText.length / 50, 1)
        emotionData.score += keywordScore
        emotionData.reasons.push(`keyword: "${keyword}" (${matches.length}x)`)
      }
    }

    // Check patterns
    for (const pattern of config.patterns) {
      const matches = normalizedText.match(pattern)
      if (matches) {
        const patternScore = (matches.length * config.weight * 1.5) / Math.max(normalizedText.length / 50, 1)
        emotionData.score += patternScore
        emotionData.reasons.push(`pattern: ${pattern.source} (${matches.length}x)`)
      }
    }
  }

  // Find the emotion with highest score
  let maxEmotion: Emotion = EmotionEnum.Idle
  let maxScore = 0
  let maxReasons: string[] = []

  for (const [emotion, data] of scores.entries()) {
    if (data.score > maxScore) {
      maxScore = data.score
      maxEmotion = emotion
      maxReasons = data.reasons
    }
  }

  // Calculate confidence (normalize score, cap at 1.0)
  const confidence = Math.min(maxScore / 10, 1.0)

  // If confidence is too low, default to Idle
  if (confidence < 0.1) {
    return {
      emotion: EmotionEnum.Idle,
      confidence: 0.0,
      reason: 'No strong emotion detected',
    }
  }

  return {
    emotion: maxEmotion,
    confidence,
    reason: maxReasons.slice(0, 3).join(', '), // Top 3 reasons
  }
}

/**
 * Detects multiple emotions in a text (for cases where emotion changes)
 * Returns an array of detected emotions with their positions
 */
export function detectEmotionsInText(text: string): Array<{
  emotion: Emotion
  startIndex: number
  endIndex: number
  confidence: number
}> {
  // Simple sentence-based detection
  // Split by sentence boundaries and detect emotion for each
  const sentences = text.split(/([.!?]\s+|\.{3,}\s*|\n+)/)
  const results: Array<{
    emotion: Emotion
    startIndex: number
    endIndex: number
    confidence: number
  }> = []

  let currentIndex = 0

  for (const sentence of sentences) {
    if (!sentence.trim()) {
      currentIndex += sentence.length
      continue
    }

    const detection = detectEmotionFromText(sentence)
    if (detection.emotion && detection.confidence > 0.2) {
      results.push({
        emotion: detection.emotion,
        startIndex: currentIndex,
        endIndex: currentIndex + sentence.length,
        confidence: detection.confidence,
      })
    }

    currentIndex += sentence.length
  }

  return results
}

/**
 * Injects emotion tokens into text based on semantic detection
 * Can be used to automatically add emotion tokens to model responses
 */
export function injectEmotionTokens(text: string, options?: {
  threshold?: number // Minimum confidence to inject (default: 0.3)
  maxTokens?: number // Maximum emotion tokens to inject (default: 3)
  preserveExisting?: boolean // Keep existing emotion tokens (default: true)
}): string {
  const {
    threshold = 0.3,
    maxTokens = 3,
    preserveExisting = true,
  } = options || {}

  // Check if text already has emotion tokens
  const hasExistingEmotions = Object.values(EmotionEnum).some(emotion =>
    text.includes(emotion),
  )

  if (hasExistingEmotions && preserveExisting) {
    return text // Don't inject if existing tokens found
  }

  const emotions = detectEmotionsInText(text)
  if (emotions.length === 0) {
    return text
  }

  // Filter by threshold and limit count
  const filteredEmotions = emotions
    .filter(e => e.confidence >= threshold)
    .slice(0, maxTokens)

  if (filteredEmotions.length === 0) {
    return text
  }

  // Inject emotion tokens at detected positions
  let result = text
  let offset = 0

  for (const { emotion, startIndex } of filteredEmotions) {
    const insertPosition = startIndex + offset
    result = `${result.slice(0, insertPosition)}${emotion} ${result.slice(insertPosition)}`
    offset += emotion.length + 1 // +1 for space
  }

  return result
}

