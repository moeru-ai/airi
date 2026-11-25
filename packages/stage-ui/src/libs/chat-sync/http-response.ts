import * as v from 'valibot'

const ErrorBodySchema = v.object({
  error: v.optional(v.string()),
  message: v.optional(v.string()),
})

export async function readJsonOrThrow<T>(res: Response, schema: v.BaseSchema<unknown, T, v.BaseIssue<unknown>>): Promise<T> {
  await throwOnError(res)
  // External boundary: validate the success shape too. A server schema drift
  // would otherwise feed a structurally broken object into `reconcileLocalAndRemote`.
  const raw: unknown = await res.json()
  return v.parse(schema, raw)
}

export async function throwOnError(res: Response): Promise<void> {
  if (res.ok)
    return

  // Non-JSON body — keep statusText.
  const body = v.safeParse(ErrorBodySchema, await res.json().catch(() => null))
  const detail = body.success ? body.output.message ?? body.output.error : undefined
  throw new Error(`HTTP ${res.status}: ${detail ?? res.statusText}`)
}
