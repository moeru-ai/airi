import type { Automation, Recipe } from '@proj-airi/core-agent'
import type { Tool } from '@xsai/shared-chat'
import type { InferOutput } from 'valibot'

import { rawTool } from '@xsai/tool'
import { array, boolean, description, maxLength, minLength, nullable, number, pipe, safeParse, strictObject, string, summarize } from 'valibot'
import { toJsonSchema } from 'xsschema'

import { automationFromInput, conditionSchema, triggerSchema } from './automation-input'

export const ARM_RECIPE_TOOL_NAME = 'builtIn_armRecipe'

/** One run that the model set: the automation that starts it, and its note. */
export interface ArmedRun {
  automation: Automation
  note: string
}

/** How the host arms a recipe: a task that waits for the automation, then runs the recipe once. */
export type ArmRecipe = (recipe: Recipe, armed: ArmedRun) => Promise<{ status: 'armed' } | { status: 'refused', reason: string }>

/** How the host stores a repeating run as a proposal. It waits for the owner's approval. */
export type ProposeRepeatingRun = (recipe: Omit<Recipe, 'id' | 'source' | 'approved' | 'enabled'>) => void

const ARM_RECIPE_DESCRIPTION = [
  'Set when a recipe that the owner invoked in this conversation runs. If the owner gave no time or event, ask instead.',
  'Use only what the owner\'s words ask for. Never add a condition, weekdays, or an idle or activity trigger that the owner did not ask for.',
  '"In N minutes" is one clock every trigger with N minutes. It counts from now. "At a time" is one clock at trigger with days null.',
  'Each run happens once, in its own space, and its result reaches you then. The owner can cancel it in the background task list.',
  'When the owner asks for a repeat, such as every day or every hour, set repeat. A repeating run is saved as a proposal that waits for the owner\'s approval. Tell the owner so.',
  'Other triggers follow the owner\'s chat, mouse, or keyboard, or a module observation. Conditions check the state when a trigger fires.',
  'For example, "remind me in 30 minutes unless I come back" adds a mouse idle condition of 30 minutes, because the owner asked for it.',
].join('\n')

const runSchema = strictObject({
  name: pipe(string(), minLength(1), maxLength(80), description('The name of the invoked recipe.')),
  repeat: pipe(boolean(), description('True only when the owner asked for a repeat. False for one run.')),
  triggers: pipe(array(triggerSchema), description('Any trigger starts the run. At least one, and only those that the owner asked for.')),
  conditions: pipe(array(conditionSchema), description('Only conditions that the owner asked for. Every one must hold when a trigger fires, or the run skips. An idle state counts from now at the earliest. Empty for none.')),
  cooldownMinutes: nullable(pipe(number(), description('With repeat: the shortest time between two runs in whole minutes. Null otherwise.'))),
  note: pipe(string(), minLength(1), maxLength(1000), description('What the run does, from the owner\'s words in this conversation, for example "Remind the owner to drink water."')),
})

const armRecipeParameters = strictObject({
  runs: pipe(array(runSchema), description('Each run that the owner asked for. For example, "remind me at 3 and look at my screen at 4" is two runs.')),
})

/** Options for the tool that arms recipes. */
interface CreateArmRecipeToolOptions {
  /** The model-timed recipes that the owner invoked by keyword in this conversation. */
  recipes: readonly Recipe[]
  arm: ArmRecipe
  /** Without it, the owner turned proposals off, so a repeating run cannot be saved. */
  propose?: ProposeRepeatingRun
}

interface PlannedRun { recipe: Recipe, repeat: boolean, run: ArmedRun }

/**
 * Creates the tool that sets when an invoked model-timed recipe runs.
 * A run that happens once is armed at once. A repeating run becomes a proposal, so it runs only after the owner approves it.
 * The caller offers it only to a turn that answers the owner's own message, after a keyword invoked such a recipe in the conversation.
 */
export async function createArmRecipeTool(options: CreateArmRecipeToolOptions): Promise<Tool[]> {
  const parameters = await toJsonSchema(armRecipeParameters)
  const invoked = options.recipes.map(recipe => recipe.name).join(', ')

  /** Checks one run. Returns the plan, or an error text that starts with the path of the wrong field. */
  function plan(input: InferOutput<typeof runSchema>, path: string): PlannedRun | string {
    const wanted = input.name.trim().toLowerCase()
    const recipe = options.recipes.find(entry => entry.name.trim().toLowerCase() === wanted)
    if (!recipe)
      return `${path}.name: no invoked recipe has that name. Invoked recipes: ${invoked}.`
    const automation = automationFromInput({ triggers: input.triggers, conditions: input.conditions, cooldownMinutes: input.repeat ? input.cooldownMinutes : null })
    if (typeof automation === 'string')
      return `${path}: ${automation}`
    if (input.repeat && !options.propose)
      return `${path}.repeat: the owner turned recipe proposals off, so a repeating run cannot be saved. Tell the owner.`
    return { recipe, repeat: input.repeat, run: { automation, note: input.note.trim() } }
  }

  /** A repeating run as a proposal: the recipe's steps on the automation that the model set. */
  function proposalOf({ recipe, run }: PlannedRun): Omit<Recipe, 'id' | 'source' | 'approved' | 'enabled'> {
    return {
      name: `${recipe.name}: ${run.note}`.slice(0, 80),
      description: run.note,
      instructions: [recipe.instructions.trim(), `This run: ${run.note}`].filter(Boolean).join('\n\n'),
      keywords: [],
      automation: run.automation,
    }
  }

  return [
    rawTool({
      name: ARM_RECIPE_TOOL_NAME,
      description: `${ARM_RECIPE_DESCRIPTION}\nInvoked recipes: ${invoked}.`,
      parameters,
      execute: async (rawInput) => {
        const parsed = safeParse(armRecipeParameters, rawInput)
        // Some providers do not enforce the schema, so the model learns which field to fix.
        if (!parsed.success)
          return `Not set: the input does not match the schema. Every field is required, with null when it does not apply.\n${summarize(parsed.issues)}`
        if (!parsed.output.runs.length)
          return 'Not set: runs needs at least one run.'
        // Every run is checked before any is set, so a fixed call never sets a run twice.
        const planned: PlannedRun[] = []
        for (const [index, input] of parsed.output.runs.entries()) {
          const entry = plan(input, `runs[${index}]`)
          if (typeof entry === 'string')
            return `Not set: ${entry}`
          planned.push(entry)
        }
        const lines: string[] = []
        for (const entry of planned) {
          if (entry.repeat) {
            options.propose!(proposalOf(entry))
            lines.push(`Saved "${entry.recipe.name}" as a repeating proposal. It runs only after the owner approves it in Settings, under Modules, Long-term memory, Recipes.`)
            continue
          }
          const armed = await options.arm(entry.recipe, entry.run)
          lines.push(armed.status === 'refused'
            ? `Not set "${entry.recipe.name}": ${armed.reason}`
            : `Set "${entry.recipe.name}". It runs once when a trigger fires and its conditions hold.`)
        }
        return lines.join('\n')
      },
    }),
  ]
}
