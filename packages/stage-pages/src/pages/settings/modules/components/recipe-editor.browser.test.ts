import type { Recipe } from '@proj-airi/stage-ui/stores/recipes'

import en from '@proj-airi/i18n/locales/en'

import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import RecipeEditor from './recipe-editor.vue'

function recipe(style: Recipe['style'], triggers: Recipe['triggers'] = []): Recipe {
  return { id: 'model:1', name: 'Owner energy', description: 'Adjusts replies.', style, triggers, source: 'model', enabled: true, approved: true }
}

async function saveUnchanged(stored: Recipe, autoRun = false) {
  const screen = await render(RecipeEditor, {
    props: { type: stored.style.kind === 'decision' ? 'decision' : 'instructions', recipe: stored, targets: [stored], autoRun },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
  await screen.getByRole('button', { name: 'Save' }).click()
  return screen.emitted<[Pick<Recipe, 'name' | 'description' | 'style' | 'triggers' | 'gate'>]>('save')?.[0]?.[0]
}

describe('recipe editor', () => {
  // Opening a recipe and saving it must keep every answer and its action.
  it('loads a stored choice decision and saves it back unchanged', async () => {
    const stored = recipe({
      kind: 'decision',
      question: { type: 'choice', instructions: 'How does the owner seem?', criteria: { option_1: 'Tired', option_2: 'Excited', option_3: 'Neutral' } },
      actions: { option_1: { kind: 'hint', text: 'Keep it short.' }, option_2: { kind: 'stay-quiet' }, option_3: { kind: 'reply' } },
    })

    expect(await saveUnchanged(stored)).toEqual({ name: stored.name, description: stored.description, style: stored.style, triggers: [], gate: undefined })
  })

  it('loads instructions with their keywords and saves them back unchanged', async () => {
    const stored = recipe({ kind: 'instructions', instructions: 'Start with the next step.' }, [{ kind: 'keyword', keywords: ['adhd', '专注'] }])

    expect(await saveUnchanged(stored)).toEqual({ name: stored.name, description: stored.description, style: stored.style, triggers: stored.triggers, gate: undefined })
  })

  it('loads an auto-run recipe with its trigger and gate and saves it back unchanged', async () => {
    const stored = { ...recipe({ kind: 'instructions', instructions: 'Greet softly.' }, [{ kind: 'schedule', everyMinutes: 45 }]), gate: 'Is it late at night?' }

    expect(await saveUnchanged(stored, true)).toEqual({ name: stored.name, description: stored.description, style: stored.style, triggers: stored.triggers, gate: stored.gate })
  })
})
