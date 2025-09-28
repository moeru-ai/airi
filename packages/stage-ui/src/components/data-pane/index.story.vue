<script setup lang="ts">
import type { DataType, Globals } from 'csstype'
import type { Ref } from 'vue'

import { ref } from 'vue'

import PropertyColor from './PropertyColor.vue'
import PropertyNumber from './PropertyNumber.vue'

type DataPaneSchemaTypes
  = | DataPaneSchemaNumber
    | DataPaneSchemaColor
    | DataPaneSchemaString
    | DataPaneSchemaBoolean
    | DataPaneSchemaSelect
    | DataPaneSchemaJSON
    | DataPaneSchemaPoint
    | DataPaneSchemaFile
    | DataPaneSchemaDate

interface DataPaneSchema {
  [key: string]: DataPaneSchemaTypes
}

interface DataPaneSchemaNumber {
  type: 'number'
  default?: number
  min?: number
  max?: number
  step?: number
  label?: string
}

interface DataPaneSchemaColor {
  type: 'color'
  default?: string
  defaultMode?: 'hex' | 'rgb' | 'hsl'
  label?: string
}

interface DataPaneSchemaString {
  type: 'string'
  default?: string
  label?: string
}

interface DataPaneSchemaBoolean {
  type: 'boolean'
  default?: boolean
  label?: string
}

interface DataPaneSchemaSelect {
  type: 'select'
  options: Array<string> | Array<{ label: string, value: string }>
  default?: string
  label?: string
}

interface DataPaneSchemaJSON {
  type: 'json'
  default?: string
  label?: string
}

interface DataPaneSchemaPoint {
  type: 'point'
  default?: { x: number, y: number }
  label?: string
}

interface DataPaneSchemaFile {
  type: 'file'
  default?: File
  label?: string
}

interface DataPaneSchemaDate {
  type: 'date'
  default?: Date
  label?: string
}

type SchemaToValueType<T extends DataPaneSchemaTypes>
  = T extends DataPaneSchemaNumber ? number
    : T extends DataPaneSchemaColor ? Globals | DataType.Color
      : T extends DataPaneSchemaString ? string
        : T extends DataPaneSchemaBoolean ? boolean
          : T extends DataPaneSchemaSelect ? string
            : T extends DataPaneSchemaJSON ? string
              : T extends DataPaneSchemaPoint ? { x: number, y: number }
                : T extends DataPaneSchemaFile ? File
                  : T extends DataPaneSchemaDate ? Date
                    : never

type InferDataPaneType<T extends DataPaneSchema> = {
  [K in keyof T]: SchemaToValueType<T[K]>
}

function useDataPane<T extends DataPaneSchema>(schema: T): {
  data: Ref<InferDataPaneType<T>>
  schema: { [K in keyof InferDataPaneType<T>]: T[K] }
  states: Ref<Record<keyof T, unknown>>
  stateOf: <S>(key: string) => S
} {
  const data = ref<InferDataPaneType<T>>({} as any)
  const states = ref<Record<keyof T, any>>({} as Record<keyof T, unknown>)

  function initStateFor(key: string, defaultValue: unknown) {
    if (!states.value[key]) {
      states.value[key] = defaultValue
    }
  }

  function stateOf<S>(key: string): S {
    return states.value[key]
  }

  for (const key in schema) {
    const fieldSchema = schema[key]
    if (fieldSchema.default !== undefined) {
      data.value[key] = fieldSchema.default as SchemaToValueType<typeof fieldSchema>
    }

    if (fieldSchema.type === 'color') {
      initStateFor(key, { showColorPicker: false })
    }
  }

  return {
    data: data as Ref<InferDataPaneType<T>>,
    schema,
    states: states as Ref<Record<keyof T, unknown>>,
    stateOf,
  }
}

const { data, schema } = useDataPane({
  number: { type: 'number', default: 50, min: 0, max: 100, step: 0.01, label: 'Number' },
  color: { type: 'color', default: '#ff0000', defaultMode: 'hex', label: 'Color' },
})
</script>

<template>
  <Story title="Data Pane" group="data-pane" :layout="{ type: 'grid', width: 500 }">
    <template #controls>
      <ThemeColorsHueControl />
    </template>

    <Variant id="default-min" title="Default">
      <div grid grid-cols-5 gap-2>
        <template v-for="(fieldSchema, fieldName) in schema" :key="fieldName">
          <template v-if="fieldSchema.type === 'number'">
            <PropertyNumber
              v-model="data[fieldName] as number"
              :min="fieldSchema.min"
              :max="fieldSchema.max"
              :step="fieldSchema.step"
              :label="fieldSchema.label"
            />
          </template>
          <template v-if="fieldSchema.type === 'color'">
            <PropertyColor v-model="data[fieldName] as Globals | DataType.Color" />
          </template>
        </template>
      </div>
    </Variant>
  </Story>
</template>
