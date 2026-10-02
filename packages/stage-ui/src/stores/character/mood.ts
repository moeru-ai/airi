import type { MoodProfile, MoodState, Pad } from '@proj-airi/core-agent'

import { applyMoodAppraisal, askWithin, calmMood, decayMood, describeMood, moodExpression, moodIntensitiesFromAnswers, moodPad, moodProfileFromTemperament, moodQuestions, presentFeelings } from '@proj-airi/core-agent'
import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { getAiriCardTemperament } from '../../services/airi-card-editor'
import { useAiriCardStore } from '../modules/airi-card'
import { useTriageStore } from '../modules/triage'

/** A mood appraisal is not urgent, so it waits longer than intake triage. A late answer leaves mood unchanged. */
export const MOOD_APPRAISAL_DEADLINE_MS = 3_000

/** Persona text that the classifier reads. Long cards are cut, because the appraisal needs character, not the whole card. */
const PERSONA_TEXT_LIMIT = 1_000

/**
 * Mood state of each persona, kept while no run is active.
 *
 * Use when:
 * - A turn or an urgent event may change how the character feels, or the stage and the conversation read the current mood.
 *
 * Expects:
 * - The renderer that runs chat turns calls {@link appraise}. Other renderers only read.
 *
 * Returns:
 * - Stored states and the mood now, after decay. Without a classifier, mood has no update path and rests at the baseline.
 */
export const useCharacterMoodStore = defineStore('character-mood', () => {
  const states = useLocalStorage<Record<string, MoodState>>('character/mood/feelings', {})
  const triage = useTriageStore()
  const cards = useAiriCardStore()

  /** Whether mood can change. The stage and the conversation use mood only while it can. */
  const active = computed(() => Boolean(triage.classifier))

  /** How the persona's mood moves, from the temperament on its card. */
  function profileOf(personaId: string): MoodProfile {
    return moodProfileFromTemperament(getAiriCardTemperament(cards.getCard(personaId)))
  }

  /** The persona's mood now. Decay is computed on read and never stored. */
  function current(personaId: string, now = Date.now()): Pad {
    const profile = profileOf(personaId)
    const state = states.value[personaId]
    return moodPad(state ? decayMood(state, profile, now) : calmMood(now), profile)
  }

  /** The persona's feelings now, after decay. */
  function feelingsNow(personaId: string, now: number) {
    const state = states.value[personaId]
    return state ? decayMood(state, profileOf(personaId), now).intensities : calmMood(now).intensities
  }

  /** Present feelings of the persona now, strongest first. A mood is usually a blend. */
  function feelingsOf(personaId: string, now = Date.now()) {
    return presentFeelings(feelingsNow(personaId, now))
  }

  /** One sentence about the persona's mood for prompts, naming its blend in words. */
  function describe(personaId: string, now = Date.now()) {
    return describeMood(feelingsNow(personaId, now))
  }

  /** The baseline expression of the persona's mood now, for displays. */
  function expressionOf(personaId: string, now = Date.now()) {
    return moodExpression(current(personaId, now))
  }

  /**
   * Asks the attention classifier how the latest interaction makes the persona feel, and moves its mood.
   * Feeling probabilities are the weights, so an unsure answer spreads or shrinks them. Smoothing handles the noise, so mood skips the trust threshold.
   *
   * Returns:
   * - The new state, or undefined when the classifier did not answer both questions in time.
   */
  async function appraise(personaId: string, input: { persona?: string, interaction: string }): Promise<MoodState | undefined> {
    const classifier = triage.classifier
    if (!classifier || !input.interaction.trim())
      return undefined
    const answers = await askWithin(classifier, {
      state: { persona: input.persona?.slice(0, PERSONA_TEXT_LIMIT) ?? '', mood: current(personaId) },
      untrusted: input.interaction,
      questions: moodQuestions(),
    }, { deadlineMs: MOOD_APPRAISAL_DEADLINE_MS })

    const intensities = moodIntensitiesFromAnswers(answers)
    if (!intensities)
      return undefined

    const now = Date.now()
    const next = applyMoodAppraisal(states.value[personaId] ?? calmMood(now), profileOf(personaId), intensities, now)
    states.value = { ...states.value, [personaId]: next }
    return next
  }

  /** Returns the persona to its baseline at once. */
  function reset(personaId: string) {
    const { [personaId]: _removed, ...rest } = states.value
    states.value = rest
  }

  return {
    states,
    active,
    profileOf,
    current,
    expressionOf,
    feelingsOf,
    describe,
    appraise,
    reset,
  }
})
