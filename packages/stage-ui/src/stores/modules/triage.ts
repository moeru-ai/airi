import type { ChatIntakeDecision, Classifier, IntakeAppraisal, Pad, Recipe, Stimulus } from '@proj-airi/core-agent'

import type { ClassifierCompletion } from '../../libs/classifier/llm'

import { applyRecipeDecisions, appraiseStimulus, askWithin, capSceneSalience, CLASSIFIER_DEADLINE_MS, decideByAppraisal, decisionRecipes, passGates, recipeDecisionRequest, recipeGateRequest } from '@proj-airi/core-agent'
import { rawTool } from '@xsai/tool'
import { defineStore } from 'pinia'
import { computed, markRaw } from 'vue'

import { createDecisionsClassifier } from '../../libs/classifier/decisions'
import { createLlmClassifier } from '../../libs/classifier/llm'
import { USE_RECIPE_TOOL_NAME } from '../../tools/use-recipe'
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

  /** Appraises a stimulus with the configured backend, or returns nothing without one. The mood, when given, goes to the classifier and the trace. */
  async function appraise(stimulus: Stimulus, deadlineMs: number, options: { attendCriteria?: string, mood?: Pad } = {}): Promise<IntakeAppraisal | undefined> {
    const current = classifier.value
    if (!current)
      return undefined
    return appraiseStimulus(stimulus, current, { deadlineMs, threshold: settings.effectiveThreshold, ...options })
  }

  /** Intake policy for input from a connection. Without a backend, the input is admitted by rule. */
  async function decideConnectionIntake(stimulus: Stimulus, mood?: Pad): Promise<ChatIntakeDecision> {
    if (!classifier.value)
      return { outcome: 'admitted', reason: 'connection-input', decidedBy: 'rule', salience: capSceneSalience(stimulus, stimulus.salience) }
    return decideByAppraisal(stimulus, await appraise(stimulus, CLASSIFIER_DEADLINE_MS, { mood }))
  }

  /** Appraisal for a background notification, with the longer deadline. */
  function appraiseNotification(stimulus: Stimulus, mood?: Pad) {
    return appraise(stimulus, NOTIFICATION_TRIAGE_DEADLINE_MS, { mood })
  }

  /** Appraisal of the idle owner scene. The question asks about raising something unprompted. */
  function appraiseIdle(stimulus: Stimulus, mood?: Pad) {
    return appraise(stimulus, NOTIFICATION_TRIAGE_DEADLINE_MS, { mood, attendCriteria: 'The event is the current state of the owner\'s scene, and nobody asked anything. Answer yes only when something in it is worth raising with the owner now.' })
  }

  /**
   * Asks every usable decision recipe about one message in a single classifier call.
   * A late, failed, or unsure answer chooses nothing, so the run replies.
   */
  async function decideRecipes(recipes: readonly Recipe[], message: string, signal: AbortSignal): Promise<{ silent?: { reason?: string }, hints: string[], applied: string[] } | undefined> {
    const current = classifier.value
    const deciding = decisionRecipes(recipes)
    if (!current || !deciding.length)
      return undefined
    const answers = await askWithin(current, recipeDecisionRequest(deciding, message), { deadlineMs: CLASSIFIER_DEADLINE_MS, signal })
    const outcome = applyRecipeDecisions(deciding, answers, settings.effectiveThreshold)
    // A decision can point to another recipe. The run sees it like a keyword trigger.
    const pointed = recipes.filter(recipe => outcome.recipeIds.includes(recipe.id)).map(recipe => recipe.name)
    return {
      silent: outcome.silent,
      hints: pointed.length ? [...outcome.hints, `This message matches these recipes: ${pointed.join(', ')}. Call ${USE_RECIPE_TOOL_NAME} for each before you reply.`] : outcome.hints,
      applied: outcome.applied,
    }
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
    return passGates(recipes, await askWithin(current, request, { deadlineMs: NOTIFICATION_TRIAGE_DEADLINE_MS }), settings.effectiveThreshold)
  }

  return {
    classifier,
    decideRecipes,
    passRecipeGates,
    decideConnectionIntake,
    appraiseNotification,
    appraiseIdle,
  }
})
