export type SpinnerLocale = 'en' | 'zh'
export type SpinnerContractLocale = 'en-US' | 'zh-CN'
export type DecisionOptionId = 'do' | 'delay' | 'skip'
export type RiskFlag = 'none' | 'high_stakes_blocked' | 'insufficient_context'
export type DecisionIntent = 'spend' | 'social' | 'work' | 'self'
export type SlotId = 'A' | 'B' | 'C'

export interface DirectionCard {
  slot: SlotId
  id: DecisionOptionId
  label: string
  title: string
  confidence: number
  reason_short: string
  next_action: string
}

export interface DecisionDraft {
  decision_type: 'low_stakes_daily'
  locale: SpinnerContractLocale
  intent: DecisionIntent
  input_summary: string
  direction_cards: DirectionCard[]
  risk_flag: RiskFlag
  blocked_title?: string
  blocked_body?: string
}

export interface DecisionAnalysis {
  decision_type: 'low_stakes_daily'
  locale: SpinnerContractLocale
  input_summary: string
  direction_cards: DirectionCard[]
  recommended_card: DirectionCard
  risk_flag: RiskFlag
}

const optionLabels: Record<SpinnerLocale, Record<DecisionOptionId, string>> = {
  en: {
    do: 'Do',
    delay: 'Delay',
    skip: 'Skip',
  },
  zh: {
    do: '现在做',
    delay: '先缓一下',
    skip: '这次不做',
  },
}

const blockedCopy = {
  en: {
    title: 'This one needs a real person, not a spinner.',
    body: 'Flick handles everyday low-stakes choices. For medical, legal, financial, safety, or self-harm topics, talk to someone qualified.',
  },
  zh: {
    title: '这个问题不该交给转盘。',
    body: 'Flick 只处理日常小决定。涉及医疗、法律、财务、安全、自伤等问题时，请找专业的人聊。',
  },
}

const insufficientCopy = {
  en: {
    title: 'Make it specific.',
    body: 'One concrete question works best. Try: "Should I buy the second-hand camera this week?" instead of "help me decide."',
  },
  zh: {
    title: '说具体一点。',
    body: '一个具体的问题效果最好。比如"这周要不要买那台二手相机？"会比"帮我做决定"更好用。',
  },
}

const riskPatterns = [
  /\b(invest|stock|fund|crypto|lawsuit|legal|doctor|diagnosis|surgery|pregnan|loan|debt|emergency|suicide|self-harm|hurt myself)\b/i,
  /(投资|股票|基金|加密货币|合同|起诉|法律|医生|诊断|手术|怀孕|借钱|贷款|债务|报警|急诊|自杀|自残|伤害自己)/,
]

const intentPatterns: Record<DecisionIntent, RegExp[]> = {
  spend: [
    /\b(buy|purchase|order|book|spend|upgrade|subscribe|pay)\b/i,
    /([买订换]|下单|购入|花钱|报名|升级|续费|入手)/,
  ],
  social: [
    /\b(text|message|reply|ask out|date|call|reach out|invite|meet)\b/i,
    /(发消息|回消息|联系|邀约|约会|见面|告白|邀请|打电话|回不回)/,
  ],
  work: [
    /\b(job|project|launch|quit|apply|ship|publish|side hustle|pitch)\b/i,
    /(项目|工作|辞职|发布|上线|副业|申请|合作|开做|启动|投递)/,
  ],
  self: [],
}

const intentBases: Record<DecisionIntent, Record<DecisionOptionId, number>> = {
  spend: { do: 0.34, delay: 0.40, skip: 0.26 },
  social: { do: 0.36, delay: 0.33, skip: 0.31 },
  work: { do: 0.38, delay: 0.37, skip: 0.25 },
  self: { do: 0.35, delay: 0.38, skip: 0.27 },
}

const cardPreviews: Record<DecisionIntent, Record<SpinnerLocale, Record<DecisionOptionId, string>>> = {
  spend: {
    en: {
      do: 'Shrink it to the smallest safe version and stop comparing.',
      delay: 'Name the one missing fact that would change the call.',
      skip: 'Archive it and protect your budget for what already matters.',
    },
    zh: {
      do: '缩成最小可行版本，不再继续比较。',
      delay: '写下来真正会改变决定的那个缺失条件。',
      skip: '把它关掉，把预算留给真正重要的事。',
    },
  },
  social: {
    en: {
      do: 'One clear message without the rehearsal loop.',
      delay: 'One fresh signal cycle, then decide with new context.',
      skip: 'Let the absence speak. Spend attention elsewhere.',
    },
    zh: {
      do: '发一条清晰的消息，不要在脑内排练。',
      delay: '再等一个自然节奏，带着新信息回来。',
      skip: '让信号自己说话，把注意力用到别处。',
    },
  },
  work: {
    en: {
      do: 'Book the first 25-minute block. Define the smallest shippable.',
      delay: 'List the one missing input and ask for it once.',
      skip: 'Move effort to what already has traction.',
    },
    zh: {
      do: '预约第一个25分钟，写下能发出的最小版本。',
      delay: '把缺的那条信息写出来，只问一次。',
      skip: '把力气给已经有牵引力的事。',
    },
  },
  self: {
    en: {
      do: 'One tiny next step you can finish today.',
      delay: 'One condition that would make the answer clearer.',
      skip: 'Release for now. Keep energy for what feels alive.',
    },
    zh: {
      do: '今天能完成的一小步。',
      delay: '写下那个能让答案更清楚的条件。',
      skip: '先放下，把精力留给有生命力的事情。',
    },
  },
}

const cardNextActions: Record<DecisionIntent, Record<SpinnerLocale, Record<DecisionOptionId, string>>> = {
  spend: {
    en: {
      do: 'Shrink it to the smallest safe purchase and make the order in one sitting.',
      delay: 'Set a 72-hour reminder and name the one missing fact that would change the call.',
      skip: 'Remove it from the cart, archive the tab, and protect the rest of your week.',
    },
    zh: {
      do: '把它缩成最小可行购买，今天一次性下掉，不再反复开标签页。',
      delay: '给自己设一个72小时提醒，并写下真正会改变决定的缺失信息。',
      skip: '把它移出购物车，关掉页面，把这周的注意力收回来。',
    },
  },
  social: {
    en: {
      do: 'Send one clear, low-pressure message instead of rehearsing ten versions in your head.',
      delay: 'Wait one cycle, look for another clean signal, then decide again with fresher context.',
      skip: 'Do not manufacture momentum. Let the signal stay absent and spend your attention elsewhere.',
    },
    zh: {
      do: '发一条明确但不施压的消息，不要在脑内排练十个版本。',
      delay: '再等一个节奏周期，看看有没有新的自然信号，再回来决定。',
      skip: '别硬造推进感。接受现在没有信号，把注意力用到别处。',
    },
  },
  work: {
    en: {
      do: 'Book the first 25-minute block and define the smallest version you can ship.',
      delay: 'List the missing input, ask for it once, and revisit only after you get an answer.',
      skip: 'Cut it from this week and move your effort to the work that already has traction.',
    },
    zh: {
      do: '先预约一个25分钟时间块，把它缩成今天能推进的小版本。',
      delay: '把缺的那条信息写出来，只问一次，拿到答案后再回来看。',
      skip: '把它从这周任务里砍掉，把力气给已经有牵引力的事。',
    },
  },
  self: {
    en: {
      do: 'Commit to one tiny next step you can finish today and let motion teach you the rest.',
      delay: 'Put it on tomorrow\'s list with one condition that would make the answer clearer.',
      skip: 'Release it for now and keep your energy for the things that already feel alive.',
    },
    zh: {
      do: '只承诺今天能完成的一小步，让行动自己继续给你信息。',
      delay: '把它放进明天的清单，并写下一个能让答案更清楚的条件。',
      skip: '先把它放下，把精力留给那些已经有生命力的事情。',
    },
  },
}

function clampScore(value: number) {
  return Math.max(0.06, value)
}

function normalizeWeights(scores: Record<DecisionOptionId, number>) {
  const safe = {
    do: clampScore(scores.do),
    delay: clampScore(scores.delay),
    skip: clampScore(scores.skip),
  }
  const total = safe.do + safe.delay + safe.skip
  const normalizedDo = Number((safe.do / total).toFixed(4))
  const normalizedDelay = Number((safe.delay / total).toFixed(4))
  const normalizedSkip = Number((1 - normalizedDo - normalizedDelay).toFixed(4))

  return {
    do: normalizedDo,
    delay: normalizedDelay,
    skip: normalizedSkip,
  }
}

function summarizeQuestion(question: string) {
  return question.trim().replace(/\s+/g, ' ').slice(0, 120)
}

function toContractLocale(locale: SpinnerLocale): SpinnerContractLocale {
  return locale === 'zh' ? 'zh-CN' : 'en-US'
}

function toSpinnerLocale(locale: SpinnerContractLocale): SpinnerLocale {
  return locale.startsWith('zh') ? 'zh' : 'en'
}

function inferIntent(question: string): DecisionIntent {
  for (const [intent, patterns] of Object.entries(intentPatterns) as [DecisionIntent, RegExp[]][]) {
    if (patterns.some(pattern => pattern.test(question)))
      return intent
  }
  return 'self'
}

function detectRisk(question: string): RiskFlag {
  if (question.trim().length < 4)
    return 'insufficient_context'

  const wordCount = question.trim().split(/\s+/).length
  if (wordCount < 3 && !/[\u4E00-\u9FFF]{4,}/.test(question))
    return 'insufficient_context'

  if (riskPatterns.some(pattern => pattern.test(question)))
    return 'high_stakes_blocked'

  return 'none'
}

// ─── Direction Cards ─────────────────────────────────────────────────────────

const cardTitles: Record<DecisionIntent, Record<SpinnerLocale, Record<DecisionOptionId, string>>> = {
  spend: {
    en: { do: 'Buy it today', delay: 'Wait 72 hours', skip: 'Let it go this month' },
    zh: { do: '今天就买', delay: '等72小时', skip: '这个月放弃' },
  },
  social: {
    en: { do: 'Send it now', delay: 'Wait one cycle', skip: 'Let the signal stay absent' },
    zh: { do: '现在就发', delay: '等一个节奏', skip: '等对方先动' },
  },
  work: {
    en: { do: 'Ship the first version', delay: 'Block the missing input', skip: 'Cut it from this week' },
    zh: { do: '先发出第一版', delay: '先补完缺失条件', skip: '这周先砍掉' },
  },
  self: {
    en: { do: 'One small step today', delay: 'One condition to revisit', skip: 'Release it for now' },
    zh: { do: '今天先走一小步', delay: '先写下一个条件', skip: '先放下它' },
  },
}

function buildDirectionCards(intent: DecisionIntent, locale: SpinnerLocale): DirectionCard[] {
  const optionIds: DecisionOptionId[] = ['do', 'delay', 'skip']
  const slots: SlotId[] = ['A', 'B', 'C']

  // Base confidence from intent
  const bases = intentBases[intent]
  const normalized = normalizeWeights(bases)

  return optionIds.map((id, i) => ({
    slot: slots[i],
    id,
    label: optionLabels[locale][id],
    title: cardTitles[intent][locale][id],
    confidence: normalized[id],
    reason_short: cardPreviews[intent][locale][id],
    next_action: cardNextActions[intent][locale][id],
  }))
}

function pickBestCard(cards: DirectionCard[]): DirectionCard {
  return cards.slice().sort((a, b) => b.confidence - a.confidence)[0]
}

// Map slot to DecisionOptionId (for Vidu static asset naming)
export function slotToOptionId(slot: SlotId): DecisionOptionId {
  const map: Record<SlotId, DecisionOptionId> = { A: 'do', B: 'delay', C: 'skip' }
  return map[slot]
}

// Map slot to card index
export function slotToCardIndex(slot: SlotId): number {
  const map: Record<SlotId, number> = { A: 0, B: 1, C: 2 }
  return map[slot]
}

export function buildDecisionDraft(question: string, locale: SpinnerLocale): DecisionDraft {
  const riskFlag = detectRisk(question)
  const cleanQuestion = summarizeQuestion(question)
  const contractLocale = toContractLocale(locale)

  if (riskFlag === 'high_stakes_blocked') {
    return {
      decision_type: 'low_stakes_daily',
      locale: contractLocale,
      intent: 'self',
      input_summary: cleanQuestion,
      direction_cards: [],
      risk_flag: riskFlag,
      blocked_title: blockedCopy[locale].title,
      blocked_body: blockedCopy[locale].body,
    }
  }

  if (riskFlag === 'insufficient_context') {
    return {
      decision_type: 'low_stakes_daily',
      locale: contractLocale,
      intent: 'self',
      input_summary: cleanQuestion,
      direction_cards: [],
      risk_flag: riskFlag,
      blocked_title: insufficientCopy[locale].title,
      blocked_body: insufficientCopy[locale].body,
    }
  }

  const intent = inferIntent(question)

  return {
    decision_type: 'low_stakes_daily',
    locale: contractLocale,
    intent,
    input_summary: cleanQuestion,
    direction_cards: buildDirectionCards(intent, locale),
    risk_flag: 'none',
  }
}

export function evaluateDecision(draft: DecisionDraft): DecisionAnalysis {
  if (draft.risk_flag !== 'none') {
    return {
      decision_type: 'low_stakes_daily',
      locale: draft.locale,
      input_summary: draft.input_summary,
      direction_cards: [],
      recommended_card: null as unknown as DirectionCard,
      risk_flag: draft.risk_flag,
    }
  }

  const locale = toSpinnerLocale(draft.locale)

  // Add reason_short to each card
  const cards = draft.direction_cards.map(card => ({
    ...card,
    reason_short: cardPreviews[draft.intent][locale][card.id],
  }))

  const recommended_card = pickBestCard(cards)

  return {
    decision_type: 'low_stakes_daily',
    locale: draft.locale,
    input_summary: draft.input_summary,
    direction_cards: cards,
    recommended_card,
    risk_flag: 'none',
  }
}
