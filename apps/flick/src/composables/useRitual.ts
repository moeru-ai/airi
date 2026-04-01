import type { DecisionAnalysis, DecisionDraft, DirectionCard, SlotId, SpinnerLocale } from '../utils/flick-engine'

import { computed, ref } from 'vue'

import { buildDecisionDraft, evaluateDecision } from '../utils/flick-engine'

export type SlotPhase = 'idle' | 'spinning' | 'slot-selecting' | 'revealed'

export interface UseRitualOptions {
  locale: { value: SpinnerLocale }
  question: { value: string }
}

export function useRitual({ locale, question }: UseRitualOptions) {
  // ─── State ─────────────────────────────────────────────────────────────────
  const analysis = ref<DecisionAnalysis | null>(null)
  const spinning = ref(false)
  const slotPhase = ref<SlotPhase>('idle')
  const revealedCard = ref<DirectionCard | null>(null)
  const selectedSlot = ref<SlotId | null>(null)
  const spinNonce = ref(0)
  const cardsVisible = ref(false)
  const targetAngle = ref(0)
  const draft = ref<DecisionDraft | null>(null)

  // ─── Computed ───────────────────────────────────────────────────────────────
  const canSpin = computed(() => Boolean(analysis.value) && slotPhase.value === 'idle')
  const recommendedCard = computed(() => analysis.value?.recommended_card ?? null)
  const directionCards = computed(() => analysis.value?.direction_cards ?? [])

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function getTargetAngle(slot: SlotId | null | undefined): number {
    if (!slot)
      return 0
    switch (slot) {
      case 'A':
        return 0
      case 'B':
        return -120
      case 'C':
        return -240
      default:
        return 0
    }
  }

  function resetResultState() {
    analysis.value = null
    spinning.value = false
    slotPhase.value = 'idle'
    revealedCard.value = null
    selectedSlot.value = null
    cardsVisible.value = false
  }

  // ─── Actions ───────────────────────────────────────────────────────────────
  function startPrototype() {
    const nextDraft = buildDecisionDraft(question.value, locale.value)
    draft.value = nextDraft
    resetResultState()

    if (nextDraft.risk_flag === 'none') {
      analysis.value = evaluateDecision(nextDraft)
      cardsVisible.value = true
    }
  }

  function spinRitual() {
    if (!analysis.value || spinning.value)
      return

    spinNonce.value += 1
    spinning.value = true
    slotPhase.value = 'spinning'
    cardsVisible.value = false

    // Random target based on one of the three cards
    const randomCard = directionCards.value[Math.floor(Math.random() * directionCards.value.length)]
    targetAngle.value = getTargetAngle(randomCard?.slot)

    // The FlickStandIn component handles the 1800ms RAF animation
    // We transition to slot-selecting after animation completes
    setTimeout(() => {
      spinning.value = false
      slotPhase.value = 'slot-selecting'
    }, 1800)
  }

  function selectSlot(slot: SlotId): DirectionCard | null {
    if (!analysis.value)
      return null
    selectedSlot.value = slot
    const cardIndex = analysis.value.direction_cards.findIndex(c => c.slot === slot)
    if (cardIndex === -1)
      return null
    const card = analysis.value.direction_cards[cardIndex]
    revealedCard.value = card
    slotPhase.value = 'revealed'
    spinNonce.value += 1
    return card
  }

  function resetRitual() {
    question.value = ''
    draft.value = null
    resetResultState()
  }

  function onSpinningComplete() {
    spinning.value = false
    slotPhase.value = 'slot-selecting'
  }

  function rebuildForLocale() {
    if (!draft.value)
      return
    draft.value = buildDecisionDraft(question.value, locale.value)
    resetResultState()
    if (draft.value.risk_flag === 'none') {
      analysis.value = evaluateDecision(draft.value)
      cardsVisible.value = true
    }
    else {
      analysis.value = null
    }
  }

  return {
    // State
    analysis,
    spinning,
    slotPhase,
    revealedCard,
    spinNonce,
    cardsVisible,
    targetAngle,
    draft,
    // Computed
    canSpin,
    recommendedCard,
    directionCards,
    // Helpers
    getTargetAngle,
    resetResultState,
    rebuildForLocale,
    // Actions
    startPrototype,
    spinRitual,
    selectSlot,
    resetRitual,
    onSpinningComplete,
  }
}
