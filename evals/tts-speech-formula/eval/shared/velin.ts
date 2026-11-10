import { readFile } from 'node:fs/promises'

import { renderMarkdownString } from '@velin-dev/core-vue/render-node'

/**
 * Rendered prompts by file and props. A run asks for the same few prompts thousands of times,
 * and each render compiles a Vue component, so every distinct prompt renders once per process.
 */
const rendered = new Map<string, Promise<string>>()

/**
 * Renders a Velin markdown prompt.
 *
 * Velin escapes backslashes, underscores, and braces in plain text when it writes markdown back.
 * Keep every LaTeX example of a prompt in a code span.
 */
export function renderVelinPrompt(file: URL, props: Readonly<Record<string, string>>): Promise<string> {
  const key = JSON.stringify([file.href, props])
  let prompt = rendered.get(key)
  if (!prompt) {
    prompt = readFile(file, 'utf8')
      .then(source => renderMarkdownString(source, props))
      .then(result => result.rendered.trim())
    rendered.set(key, prompt)
  }
  return prompt
}
