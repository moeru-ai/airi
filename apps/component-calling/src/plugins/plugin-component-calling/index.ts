import type { Component } from 'vue'
import type { Schema } from 'xsschema'

import { markRaw } from 'vue'
import { toJsonSchema } from 'xsschema'

export function defineCallingComponent<T extends Schema>(name: string, component: Component, schema: T, exampleProps?: Record<string, any>) {
  return {
    component: markRaw(component),
    exampleProps,
    name,
    schema: toJsonSchema(schema),
  }
}
