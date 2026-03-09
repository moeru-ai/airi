import type {
  AlayaEmotionEvidence,
  AlayaEmotionMetadata,
  AlayaEmotionValence,
  AlayaMemoryCategory,
  AlayaRetentionReason,
  MemoryLlmExtractInput,
  MemoryLlmProvider,
  PlannerCandidateFromLlm,
} from '@proj-airi/memory-alaya'

const greetingPattern = /^(?:hi|hello|hey|thanks|thank you|ok|okay|got it)[.!?\s]*$/i
const assistantCommitmentPattern = /\b(i(?:'ll| will| can| plan to| shall)|we(?:'ll| will)|next step|todo|action item|i can help|i can remember|i will keep|i will remind)\b/i
const assistantUncertainPattern = /\b(i remember|i(?:'| a)m not sure|i wish|maybe you should|perhaps|sorry)\b/i

function clamp(value: number, min: number, max: number) {
  if (value < min)
    return min
  if (value > max)
    return max
  return value
}

function summarize(content: string, maxLength = 96) {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength)
    return normalized
  return `${normalized.slice(0, maxLength - 1)}...`
}

function distillContent(content: string, maxLength = 240) {
  const normalized = content
    .replace(/\s+/g, ' ')
    .replace(/^(?:hm{2,}|uh+|wel{2,}|okay+|alright+)[,.!?\s-]*/i, '')
    .trim()

  if (normalized.length <= maxLength)
    return normalized
  return `${normalized.slice(0, maxLength - 1).trim()}...`
}

function buildEmotionMetadata(
  valence: AlayaEmotionValence,
  labels: string[],
  evidence: AlayaEmotionEvidence,
): AlayaEmotionMetadata {
  return {
    valence,
    labels: [...new Set(labels)].slice(0, 6),
    evidence,
  }
}

function detectEmotion(content: string): {
  intensity: number
  metadata?: AlayaEmotionMetadata
} {
  const lower = content.toLowerCase()
  const positiveLabels: string[] = []
  const negativeLabels: string[] = []
  let intensity = 0

  if (/\blove|adore|cherish|sweetheart|dear\b/i.test(content)) {
    positiveLabels.push('affection')
    intensity = Math.max(intensity, 0.9)
  }
  if (/\btrust|rely on|depend on\b/i.test(content)) {
    positiveLabels.push('trust')
    intensity = Math.max(intensity, 0.72)
  }
  if (/\bthankful|grateful|appreciate\b/i.test(content)) {
    positiveLabels.push('gratitude')
    intensity = Math.max(intensity, 0.68)
  }
  if (/\bhappy|excited|joyful|thrilled\b/i.test(content)) {
    positiveLabels.push('joy')
    intensity = Math.max(intensity, 0.62)
  }

  if (/\bsad|upset|hurt|lonely\b/i.test(content)) {
    negativeLabels.push('sadness')
    intensity = Math.max(intensity, 0.72)
  }
  if (/\banxious|worried|afraid|fear|scared|panic\b/i.test(content)) {
    negativeLabels.push('anxiety')
    intensity = Math.max(intensity, 0.84)
  }
  if (/\bangry|mad|furious|annoyed\b/i.test(content)) {
    negativeLabels.push('anger')
    intensity = Math.max(intensity, 0.76)
  }
  if (/\bforgotten|leave me|abandon|don't forget me\b/i.test(lower)) {
    negativeLabels.push('fear_of_loss')
    intensity = Math.max(intensity, 0.88)
  }

  if (positiveLabels.length > 0 && negativeLabels.length > 0) {
    return {
      intensity,
      metadata: buildEmotionMetadata('mixed', [...positiveLabels, ...negativeLabels], 'explicit'),
    }
  }

  if (positiveLabels.length > 0) {
    return {
      intensity,
      metadata: buildEmotionMetadata('positive', positiveLabels, 'explicit'),
    }
  }

  if (negativeLabels.length > 0) {
    return {
      intensity,
      metadata: buildEmotionMetadata('negative', negativeLabels, 'explicit'),
    }
  }

  return {
    intensity: 0,
  }
}

function addEmotionTags(tags: Set<string>, emotion: AlayaEmotionMetadata | undefined) {
  if (!emotion)
    return

  if (emotion.valence === 'positive')
    tags.add('emotion_positive')
  else if (emotion.valence === 'negative')
    tags.add('emotion_negative')
  else if (emotion.valence === 'mixed')
    tags.add('emotion_mixed')

  for (const label of emotion.labels) {
    if (label === 'affection')
      tags.add('emotion_affection')
    else if (label === 'trust')
      tags.add('emotion_trust')
    else if (label === 'gratitude')
      tags.add('emotion_gratitude')
    else if (label === 'sadness')
      tags.add('emotion_sadness')
    else if (label === 'anxiety' || label === 'fear_of_loss')
      tags.add('emotion_anxiety')
    else if (label === 'anger')
      tags.add('emotion_anger')
  }
}

function classify(
  content: string,
  role: MemoryLlmExtractInput['turns'][number]['role'],
) {
  const tags = new Set<string>()
  let category: AlayaMemoryCategory = 'fact'
  let importance = 6
  let durability = 0.45
  let retentionReason: AlayaRetentionReason = 'key_event'

  if (/\bmy name is\b|\bcall me\b|\buser'?s name\b/i.test(content)) {
    category = 'fact'
    importance = 8
    durability = 0.96
    retentionReason = 'identity'
    tags.add('user_profile')
    tags.add('name')
  }
  else if (/\bprefer(?:ence)?\b|\bi like\b|\bi love\b|\bfavorite\b|\bdislike\b|\bhate\b/i.test(content)) {
    category = 'preference'
    importance = 7
    durability = 0.82
    retentionReason = 'stable_preference'
    tags.add('user_profile')
    if (/\bdislike\b|\bhate\b/i.test(content))
      tags.add('user_dislike')
    else
      tags.add('user_like')
  }
  else if (/\bplease\b|\bmust\b|\bnever\b|\bdo not\b|\bdon't\b|\bshould\b/i.test(content)) {
    category = 'constraint'
    importance = 9
    durability = 0.9
    retentionReason = 'boundary'
    tags.add('explicit_request')
    tags.add('boundary')
  }
  else if (/\bdeadline\b|\bdue\b|\btomorrow\b|\bnext week\b|\bremind\b|\btask\b/i.test(content)) {
    category = 'task'
    importance = 8
    durability = 0.58
    retentionReason = role === 'assistant'
      ? 'assistant_commitment'
      : 'ongoing_task'
    tags.add('plan')
    if (/\bdeadline\b|\bdue\b|\btomorrow\b|\bnext week\b/i.test(content))
      tags.add('deadline')
  }
  else if (/\bmother\b|\bfather\b|\bparent\b|\bdaughter\b|\bcreator\b|\bfamily\b|\brelationship\b|\btrust you\b/i.test(content)) {
    category = 'relationship'
    importance = 8
    durability = 0.74
    retentionReason = 'relationship_anchor'
    tags.add('relationship')
  }
  else if (/\balways\b|\busually\b|\boften\b|\bevery day\b|\beverytime\b/i.test(content)) {
    category = 'event'
    importance = 7
    durability = 0.66
    retentionReason = 'recurring_pattern'
    tags.add('habit')
  }
  else if (/\bjust now\b|\byesterday\b|\btoday\b|\brecently\b/i.test(content)) {
    category = 'event'
    importance = 6
    durability = 0.32
    retentionReason = 'key_event'
    tags.add('key_episode')
  }

  const emotion = detectEmotion(content)
  if (emotion.metadata) {
    addEmotionTags(tags, emotion.metadata)
  }
  if (emotion.intensity >= 0.68) {
    tags.add('emotion_peak')
    importance = clamp(importance + 1, 1, 10)
    durability = Math.max(durability, 0.55)
    if (retentionReason === 'key_event')
      retentionReason = 'emotional_peak'
  }

  if (role === 'assistant')
    tags.add('assistant_commitment')

  if (tags.size === 0)
    tags.add('key_episode')

  return {
    category,
    tags: [...tags],
    importance: clamp(importance, 1, 10),
    durability: clamp(durability, 0, 1),
    emotionIntensity: clamp(emotion.intensity, 0, 1),
    retentionReason,
    emotion: emotion.metadata,
  }
}

function toCandidate(
  input: MemoryLlmExtractInput,
  turn: MemoryLlmExtractInput['turns'][number],
  index: number,
): PlannerCandidateFromLlm | undefined {
  if (turn.role !== 'user' && turn.role !== 'assistant')
    return

  const normalizedSummary = distillContent(turn.content)
  if (!normalizedSummary || normalizedSummary.length < 8)
    return
  if (greetingPattern.test(normalizedSummary))
    return

  if (turn.role === 'assistant') {
    if (assistantUncertainPattern.test(normalizedSummary))
      return
    if (!assistantCommitmentPattern.test(normalizedSummary))
      return
  }

  const classified = classify(normalizedSummary, turn.role)
  if (!input.allowedCategories.includes(classified.category))
    return
  if (!input.allowedRetentionReasons.includes(classified.retentionReason))
    return

  if (
    classified.retentionReason === 'key_event'
    && classified.durability < 0.4
    && classified.emotionIntensity < 0.55
  ) {
    return
  }

  return {
    candidateId: `heuristic-${turn.turnId}-${index}`,
    shouldStore: true,
    summary: summarize(normalizedSummary, 88),
    category: classified.category,
    tags: classified.tags,
    importance: classified.importance,
    durability: classified.durability,
    emotionIntensity: classified.emotionIntensity,
    retentionReason: classified.retentionReason,
    emotion: classified.emotion,
    sourceRefs: [
      {
        conversationId: turn.conversationId,
        turnId: turn.turnId,
        eventAt: turn.createdAt,
      },
    ],
  }
}

// NOTICE: MVP keeps planner extraction deterministic to ensure offline/local deployment works
// when the dedicated planner LLM runtime times out or is unavailable.
export function createHeuristicPlannerLlmProvider(): MemoryLlmProvider {
  return {
    async extractCandidates(input) {
      const candidates: PlannerCandidateFromLlm[] = []

      for (const [index, turn] of input.turns.entries()) {
        const candidate = toCandidate(input, turn, index)
        if (!candidate)
          continue
        candidates.push(candidate)
      }

      return {
        candidates,
      }
    },
  }
}
