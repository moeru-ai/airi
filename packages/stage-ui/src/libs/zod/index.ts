import type { ZodObject } from 'zod'
import type { $ZodType } from 'zod/v4/core'

import { ZodDefault } from 'zod'

// https://github.com/colinhacks/zod/discussions/1953#discussioncomment-14098158
export function getSchemaDefault<T>(schema: $ZodType<T> | null | undefined): Partial<T> {
  if (!schema)
    return {}

  const object = schema as unknown as ZodObject

  return Object.fromEntries(
    Object.entries(object.shape)
      .map(([k, v]) => [k, v instanceof ZodDefault ? v._def.defaultValue : undefined])
      .filter(([_, v]) => v !== undefined),
  )
}
