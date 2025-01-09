import type { Infer, Schema } from '@typeschema/valibot'
import type { ProviderOptions } from '@xsai/providers'
import type { Message } from '@xsai/shared-chat'

import { toJSONSchema, validate } from '@typeschema/valibot'
import { generateText } from '@xsai/generate-text'
import { message } from '@xsai/shared-chat'

type SchemaOrString<S extends Schema | undefined | unknown> = S extends unknown ? string : S extends Schema ? Infer<S> : never

async function parseJSONFormat<S extends Schema, R extends SchemaOrString<S>>(content: string, options: { messages: Message[], apiKey?: string, baseURL: string, model: string } & ProviderOptions, schema?: S, erroredValue?: string, errorMessage?: string): Promise<R> {
  if (!schema)
    return content as unknown as R

  try {
    let parsedContent: Infer<S>
    let correctionPrompt = ''

    if (erroredValue && errorMessage) {
      correctionPrompt = `Previous response "${JSON.stringify(erroredValue)}" was invalid due to: ${JSON.stringify(errorMessage)}\n\n`
    }

    try {
      parsedContent = JSON.parse(content)
    }
    catch (parseError) {
      console.error('Error parsing JSON:', parseError, content)

      options.messages.push(message.user(`
${correctionPrompt}The response was not valid JSON:
${JSON.stringify(content)}

Error: ${String(parseError)}

Please provide a corrected JSON response that matches the schema:
${JSON.stringify(await toJSONSchema(schema))}`))

      const response = await call(options, schema)
      return parseJSONFormat(response, options, schema, content, String(parseError))
    }

    const validation = await validate(schema, parsedContent)
    if (validation.success) {
      return parsedContent as R
    }

    console.error('Schema validation failed:', validation.issues, parsedContent)
    options.messages.push(message.user(`
${correctionPrompt}The response failed schema validation:
${JSON.stringify(parsedContent)}

Validation errors:
${validation.issues.map(issue => `- ${issue.message}`).join('\n')}

Please provide a corrected response that matches the schema:
${JSON.stringify(await toJSONSchema(schema))}`))

    const response = await call(options, schema)
    return parseJSONFormat(response, options, schema, JSON.stringify(parsedContent), validation.issues.map(i => i.message).join(', '))
  }
  catch (error) {
    console.error('Error processing response:', error)
    throw error
  }
}

/**
 * Processes user input and generates LLM response along with thought nodes.
 */
async function call<S extends Schema, R extends SchemaOrString<S>>(options: { messages: Message[], apiKey?: string, baseURL: string, model: string } & ProviderOptions, schema?: S): Promise<R> {
  if (schema != null) {
    options.messages.push(message.user(`Your response must follow the following schema:
${JSON.stringify(await toJSONSchema(schema))}

Without any extra markups such as \`\`\` in markdown, or descriptions.`))
  }

  const response = await generateText({
    baseURL: options.baseURL,
    apiKey: options.apiKey,
    model: options.model,
    messages: options.messages,
  })

  return await parseJSONFormat<S, R>(response.text || '', options, schema)
}

export async function generateObject<S extends Schema, R extends SchemaOrString<S>>(options: { messages: Message[], model: string, apiKey?: string, baseURL: string } & ProviderOptions, schema?: S): Promise<R> {
  return await call(options, schema)
}
