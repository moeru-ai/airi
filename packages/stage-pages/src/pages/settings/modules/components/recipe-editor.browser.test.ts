import type { Recipe, RecipeFields } from '@proj-airi/stage-ui/stores/recipes'

import en from '@proj-airi/i18n/locales/en'

import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import RecipeEditor from './recipe-editor.vue'

function recipe(instructions: string, keywords: Recipe['keywords'] = []): Recipe {
  return { id: 'model:1', name: 'Owner energy', description: 'Adjusts replies.', instructions, keywords, source: 'model', enabled: true, approved: true }
}

async function saveUnchanged(stored: Recipe) {
  const screen = await render(RecipeEditor, {
    props: { type: stored.decision ? 'decision' as const : 'instructions' as const, recipe: stored, targets: [stored] },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
  await screen.getByRole('button', { name: 'Save' }).click()
  return screen.emitted<[RecipeFields]>('save')?.[0]?.[0]
}

describe('recipe editor', () => {
  // Opening a recipe and saving it must keep every field.
  it('loads instructions with their keywords and saves them back unchanged', async () => {
    const stored = recipe('Start with the next step.', ['adhd', '专注'])

    expect(await saveUnchanged(stored)).toEqual({ name: stored.name, description: stored.description, instructions: stored.instructions, decision: undefined, keywords: stored.keywords, background: undefined })
  })

  // Opening a decision and saving it must keep its keywords, every answer, and its action.
  it('loads a stored choice decision and saves it back unchanged', async () => {
    const stored: Recipe = {
      ...recipe('', ['累']),
      decision: {
        question: { type: 'choice', instructions: 'How does the owner seem?', criteria: { option_1: 'Tired', option_2: 'Excited', option_3: 'Neutral' } },
        actions: { option_1: { kind: 'hint', text: 'Keep it short.' }, option_2: { kind: 'stay-quiet' } },
      },
    }

    expect(await saveUnchanged(stored)).toEqual({ name: stored.name, description: stored.description, instructions: '', decision: stored.decision, keywords: stored.keywords, background: undefined })
  })

  it('keeps a background recipe in the background', async () => {
    const stored = { ...recipe('Compare three options.'), background: true }

    expect(await saveUnchanged(stored)).toMatchObject({ background: true })
  })
})
