import type { MoodDimension, MoodState, Pad } from '@proj-airi/core-agent'

import { applyMoodAppraisal, askWithin, decayMood, DEFAULT_MOOD_PROFILE, moodIntensity, moodQuestions } from '@proj-airi/core-agent'
import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useTriageStore } from '../modules/triage'
import { useSettingsTriage } from '../settings/triage'

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
  const states = useLocalStorage<Record<string, MoodState>>('character/mood/states', {})
  const triage = useTriageStore()
  const triageSettings = useSettingsTriage()

  /** Whether mood can change. The stage and the conversation use mood only while it can. */
  const active = computed(() => Boolean(triage.classifier))

  /** The persona's mood now. Decay is computed on read and never stored. */
  function current(personaId: string, now = Date.now()): Pad {
    const state = states.value[personaId]
    return state ? decayMood(state, DEFAULT_MOOD_PROFILE, now).pad : DEFAULT_MOOD_PROFILE.baseline
  }

  /**
   * Scores how the latest interaction makes the persona feel, and moves its mood.
   * Every dimension needs a confident answer. Otherwise mood stays as it is, because a missing score would read as calm.
   *
   * Returns:
   * - The new state, or undefined when no classifier answered with confidence in time.
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

    const intensities: Partial<Record<MoodDimension, number>> = {}
    for (const dimension of Object.keys(moodQuestions()) as MoodDimension[]) {
      const answer = answers?.[dimension]
      if (answer?.type !== 'score' || !Number.isFinite(answer.score) || answer.confidence < triageSettings.effectiveThreshold)
        return undefined
      intensities[dimension] = moodIntensity(answer.score)
    }

    const now = Date.now()
    const next = applyMoodAppraisal(states.value[personaId] ?? { pad: DEFAULT_MOOD_PROFILE.baseline, updatedAt: now }, DEFAULT_MOOD_PROFILE, intensities, now)
    states.value = { ...states.value, [personaId]: next }
    return next
  }

  return {
    states,
    active,
    current,
    appraise,
  }
})
