import * as v from 'valibot'

export const ToolCallSchema = v.object({
  id: v.string(),
  name: v.string(),
  arguments: v.string(),
})

export type ToolCall = v.InferOutput<typeof ToolCallSchema>
