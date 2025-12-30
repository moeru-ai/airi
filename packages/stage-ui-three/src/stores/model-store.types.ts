import type { Vector3 } from 'three'

// Common type buckets for model-store fields
export interface Vec3 { x: number, y: number, z: number }
export type TrackingMode = 'camera' | 'mouse' | 'none'
export type HexColor = string & { __hex?: true }

export interface FieldBase<T> {
  space: string // name space
  key: string // name key
  default: T // default value
  // For future setting components UI display
  label: string
  group: string
  order: number
}

export type NumberField = FieldBase<number> & {
  type: 'number'
  min?: number
  max?: number
  step?: number
}

export type Vec3Field = FieldBase<Vector3> & {
  type: 'vec3'
}

export type ColorField = FieldBase<HexColor> & {
  type: 'color'
}

export type SelectField<T extends string = string> = FieldBase<T> & {
  type: 'select'
  options: readonly { label: string, value: T }[]
}

export interface FieldKindMap {
  number: { def: NumberField, value: number }
  vec3: { def: Vec3Field, value: Vector3 }
  color: { def: ColorField, value: HexColor }
  select: { def: SelectField<any>, value: string }
}

// type of Field
export type FieldDef = FieldKindMap[keyof FieldKindMap]['def']
// type of value
export type FieldValueOf<D> = D extends SelectField<infer T> ? T
  : D extends { type: infer K }
    ? K extends keyof FieldKindMap ? FieldKindMap[K]['value'] : never
    : never
