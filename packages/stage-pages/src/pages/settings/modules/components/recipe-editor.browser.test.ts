import type { Recipe, RecipeFields } from '@proj-airi/stage-ui/stores/recipes'

import en from '@proj-airi/i18n/locales/en'

import { MODEL_DECIDES_STEPS } from '@proj-airi/core-agent'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import RecipeEditor from './recipe-editor.vue'

function recipe(instructions: string, triggers: Recipe['triggers'] = []): Recipe {
  return { id: 'model:1', name: 'Owner energy', description: 'Adjusts replies.', instructions, triggers, source: 'model', enabled: true, approved: true }
}

async function saveUnchanged(stored: Recipe, autoRun = false) {
  const screen = await render(RecipeEditor, {
    props: { type: stored.decision ? 'decision' as const : 'instructions' as const, recipe: stored, targets: [stored], autoRun },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
  await screen.getByRole('button', { name: 'Save' }).click()
  return screen.emitted<[RecipeFields]>('save')?.[0]?.[0]
}

describe('recipe editor', () => {
  // Opening a recipe and saving it must keep every field.
  it('loads instructions with their keywords and saves them back unchanged', async () => {
    const stored = recipe('Start with the next step.', [{ kind: 'keyword', keywords: ['adhd', '专注'] }])

    expect(await saveUnchanged(stored)).toEqual({ name: stored.name, description: stored.description, instructions: stored.instructions, decision: undefined, triggers: stored.triggers, automation: undefined, modelTimed: undefined, background: undefined })
  })

  // Opening a decision and saving it must keep its keywords, every answer, and its action.
  it('loads a stored choice decision and saves it back unchanged', async () => {
    const stored: Recipe = {
      ...recipe('', [{ kind: 'keyword', keywords: ['累'] }]),
      decision: {
        question: { type: 'choice', instructions: 'How does the owner seem?', criteria: { option_1: 'Tired', option_2: 'Excited', option_3: 'Neutral' } },
        actions: { option_1: { kind: 'hint', text: 'Keep it short.' }, option_2: { kind: 'stay-quiet' }, option_3: { kind: 'reply' } },
      },
    }

    expect(await saveUnchanged(stored)).toEqual({ name: stored.name, description: stored.description, instructions: '', decision: stored.decision, triggers: stored.triggers, automation: undefined, modelTimed: undefined, background: undefined })
  })

  it('keeps a background recipe in the background', async () => {
    const stored = { ...recipe('Compare three options.'), background: true }

    expect(await saveUnchanged(stored)).toMatchObject({ background: true })
  })

  // The model sets when it runs each time a keyword invokes it, so it keeps its keywords and has no automation.
  it('loads a model-timed recipe with its keywords and saves it back unchanged', async () => {
    const stored: Recipe = { ...recipe('Remind the owner of the note.', [{ kind: 'keyword', keywords: ['提醒我', 'remind me'] }]), modelTimed: true }

    expect(await saveUnchanged(stored, true)).toEqual({ name: stored.name, description: stored.description, instructions: stored.instructions, decision: undefined, triggers: stored.triggers, automation: undefined, modelTimed: true, background: undefined })
  })

  // The model decides what each run does through preset instructions, so nothing else marks the recipe.
  it('loads an auto-run recipe whose runs the model decides and saves it back unchanged', async () => {
    const stored: Recipe = { ...recipe(MODEL_DECIDES_STEPS), automation: { triggers: [{ source: 'clock', event: 'every', minutes: 60 }], conditions: [] } }

    expect(await saveUnchanged(stored, true)).toMatchObject({ instructions: MODEL_DECIDES_STEPS, automation: stored.automation })
  })

  it('loads an auto-run recipe with its automation and saves it back unchanged', async () => {
    const stored: Recipe = {
      ...recipe('Greet softly.'),
      automation: {
        triggers: [{ source: 'clock', event: 'at', time: '07:30', days: [1, 2, 3, 4, 5] }, { source: 'mouse', event: 'active', afterIdleMinutes: 60 }, { source: 'chat', event: 'message' }],
        conditions: [{ kind: 'time', from: '22:00', to: '04:00' }, { kind: 'state', source: 'keyboard', state: 'idle', minutes: 10 }],
        cooldownMinutes: 120,
      },
    }

    expect(await saveUnchanged(stored, true)).toEqual({ name: stored.name, description: stored.description, instructions: stored.instructions, decision: undefined, triggers: [], automation: stored.automation, modelTimed: undefined, background: undefined })
  })
})
