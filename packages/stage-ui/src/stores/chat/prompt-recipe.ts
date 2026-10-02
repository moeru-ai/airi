import type { Recipe } from '@proj-airi/core-agent'

/** Format rules that the chat renderer needs from every reply. */
export const CHAT_FORMAT_RULES = `${[
  // Only listed languages load in the renderer, so every code block names its language.
  '- For any programming code block, always specify the programming language that supported on @shikijs/rehype on the rendered markdown, eg. ```python ... ```',
  '- Use $$...$$ for inline math.',
  '- Use a separate multiline $$ block for each display equation.',
  '- Use a latex fence for a list of independent one-line equations.',
  '- Use a math fence for one multiline equation or LaTeX environment.',
  '- Do not use single dollar signs as math delimiters.',
].join('\n')}\n`

/**
 * Builds the system prompt of one run: format rules, the identity of the run's persona, then its usable instruction recipes.
 *
 * Use when:
 * - A chat run starts. Identity is read for its persona then, so history never stores it.
 */
export function composeSystemPrompt(identity: string, recipes: readonly Recipe[] = []) {
  return CHAT_FORMAT_RULES + identity + describeRecipes(recipes)
}

/**
 * Lists the instruction recipes that the run may use. The list changes only when the owner edits recipes, so it stays in the cacheable prefix.
 */
function describeRecipes(recipes: readonly Recipe[]) {
  const lines = recipes.flatMap(recipe => recipe.style.kind === 'instructions' && recipe.style.instructions.trim()
    ? [`- ${recipe.name}: ${recipe.description}\n  How: ${recipe.style.instructions.trim()}`]
    : [])
  return lines.length ? `\n\nRecipes you can use when they fit. Using one is your choice:\n${lines.join('\n')}` : ''
}
