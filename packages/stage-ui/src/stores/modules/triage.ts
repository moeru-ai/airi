import type { Classifier, Recipe } from '@proj-airi/core-agent'

import type { ClassifierCompletion } from '../../libs/classifier/llm'

import { applyRecipeDecisions, askWithin, CLASSIFIER_DEADLINE_MS, decisionRecipes, passGates, recipeDecisionRequest, recipeGateRequest } from '@proj-airi/core-agent'
import { rawTool } from '@xsai/tool'
import { defineStore } from 'pinia'
import { computed, markRaw } from 'vue'

import { createDecisionsClassifier } from '../../libs/classifier/decisions'
import { createLlmClassifier } from '../../libs/classifier/llm'
import { useLLM } from '../ai/chat-llm/llm'
import { useSettingsTriage } from '../settings/triage'
import { useConsciousnessStore } from './consciousness'

/** Recipe gates run in the background, so they tolerate a slower answer than a decision before a reply. */
export const GATE_DEADLINE_MS = 3_000

/**
 * The optional classifier from the configured backend, and the recipe decisions that ask it.
 *
 * Use when:
 * - Decision recipes answer before a reply, or an auto-run recipe asks its gate.
 *
 * Expects:
 * - The owner chose a backend. Without one, nothing is asked.
 *
 * Returns:
 * - Recipe outcomes. A late answer or an answer below the threshold decides nothing.
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
      case 'decisions':
        return settings.decisionsApiKey.trim()
          ? markRaw(createDecisionsClassifier({ apiKey: settings.decisionsApiKey.trim(), endpoint: settings.decisionsEndpoint.trim(), model: settings.decisionsModel.trim() }))
          : undefined
      case 'llm':
        return settings.llmProvider && settings.llmModel ? markRaw(createLlmClassifier(complete)) : undefined
      default:
        return undefined
    }
  })

  /**
   * Asks every usable decision recipe about one message in a single classifier call.
   * A late, failed, or unsure answer chooses nothing, so the run replies.
   */
  async function decideRecipes(recipes: readonly Recipe[], message: string, signal: AbortSignal): Promise<{ silent?: { reason?: string }, hints: string[], applied: string[], recipeIds: string[] } | undefined> {
    const current = classifier.value
    const deciding = decisionRecipes(recipes)
    if (!current || !deciding.length)
      return undefined
    const answers = await askWithin(current, recipeDecisionRequest(deciding, message), { deadlineMs: CLASSIFIER_DEADLINE_MS, signal })
    // A decision can point to another recipe. The caller starts it like a keyword trigger.
    return applyRecipeDecisions(deciding, answers, settings.effectiveThreshold)
  }

  /**
   * Keeps the due auto-run recipes whose gate allows a run, in one classifier call.
   * Without a classifier or a gate, the recipes run. A late answer also lets them run, because the owner set the trigger.
   */
  async function passRecipeGates(recipes: readonly Recipe[], scene: string): Promise<Recipe[]> {
    const current = classifier.value
    const request = recipeGateRequest(recipes, scene)
    if (!current || !Object.keys(request.questions).length)
      return [...recipes]
    return passGates(recipes, await askWithin(current, request, { deadlineMs: GATE_DEADLINE_MS }), settings.effectiveThreshold)
  }

  return {
    classifier,
    decideRecipes,
    passRecipeGates,
  }
})
