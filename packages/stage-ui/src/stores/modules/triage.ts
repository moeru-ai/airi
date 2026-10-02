import type { ChatIntakeDecision, Classifier, IntakeAppraisal, Stimulus } from '@proj-airi/core-agent'

import type { ClassifierCompletion } from '../../libs/classifier/llm'

import { appraiseStimulus, capSceneSalience, CLASSIFIER_DEADLINE_MS, decideByAppraisal } from '@proj-airi/core-agent'
import { rawTool } from '@xsai/tool'
import { defineStore } from 'pinia'
import { computed, markRaw } from 'vue'

import { createJevClassifier } from '../../libs/classifier/jev'
import { createLlmClassifier } from '../../libs/classifier/llm'
import { useLLM } from '../ai/chat-llm/llm'
import { useSettingsTriage } from '../settings/triage'
import { useConsciousnessStore } from './consciousness'

/** Background notifications tolerate a slower appraisal than conversation input. */
export const NOTIFICATION_TRIAGE_DEADLINE_MS = 3_000

/**
 * Classifier triage for intake, from the configured backend.
 *
 * Use when:
 * - Input from a connection or a background notification needs an attention decision.
 *
 * Expects:
 * - Direct owner input never comes here. A synchronous local policy decides it.
 *
 * Returns:
 * - Decisions and appraisals. Without a backend, a late answer, or an answer below the threshold, the prior decides.
 */
export const useTriageStore = defineStore('triage', () => {
  const settings = useSettingsTriage()
  const consciousness = useConsciousnessStore()
  const { stream } = useLLM()

  /** Runs one forced tool call with the user's classifier model, without built-in tools. */
  async function complete(completion: ClassifierCompletion) {
    const providerId = settings.llmProvider
    const model = settings.llmModel
    const chatProvider = await consciousness.getChatProviderInstance(providerId)
    let args: unknown
    const tool = rawTool({
      name: completion.tool.name,
      description: completion.tool.description,
      parameters: completion.tool.parameters,
      execute: async (input) => {
        args = input
        return 'Answers recorded.'
      },
    })
    await stream(model, chatProvider, { turns: [{ id: 'classifier-state', type: 'user', content: [{ type: 'text', text: completion.user }] }] }, {
      abortSignal: completion.signal,
      providerId,
      supportsTools: true,
      waitForTools: true,
      toolChoice: { type: 'function', function: { name: completion.tool.name } },
      // A resolved step replaces the built-in tools and the system message, so the classifier sees only its own tool.
      resolveStep: async () => ({ model, chatProvider, providerId, systemPrompt: completion.system, tools: [tool] }),
    })
    return args
  }

  const classifier = computed<Classifier | undefined>(() => {
    switch (settings.backend) {
      case 'jev':
        return settings.jevApiKey.trim()
          ? markRaw(createJevClassifier({ apiKey: settings.jevApiKey.trim(), baseURL: settings.jevBaseUrl, model: settings.jevModel }))
          : undefined
      case 'llm':
        return settings.llmProvider && settings.llmModel ? markRaw(createLlmClassifier(complete)) : undefined
      default:
        return undefined
    }
  })

  /** Appraises a stimulus with the configured backend, or returns nothing without one. */
  async function appraise(stimulus: Stimulus, deadlineMs: number): Promise<IntakeAppraisal | undefined> {
    const current = classifier.value
    if (!current)
      return undefined
    return appraiseStimulus(stimulus, current, { deadlineMs, threshold: settings.effectiveThreshold })
  }

  /** Intake policy for input from a connection. Without a backend, the input is admitted by rule. */
  async function decideConnectionIntake(stimulus: Stimulus): Promise<ChatIntakeDecision> {
    if (!classifier.value)
      return { outcome: 'admitted', reason: 'connection-input', decidedBy: 'rule', salience: capSceneSalience(stimulus, stimulus.salience) }
    return decideByAppraisal(stimulus, await appraise(stimulus, CLASSIFIER_DEADLINE_MS))
  }

  /** Appraisal for a background notification, with the longer deadline. */
  function appraiseNotification(stimulus: Stimulus) {
    return appraise(stimulus, NOTIFICATION_TRIAGE_DEADLINE_MS)
  }

  return {
    classifier,
    decideConnectionIntake,
    appraiseNotification,
  }
})
