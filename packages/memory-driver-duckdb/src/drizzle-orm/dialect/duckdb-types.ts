import type { Dictionary, Field, Struct, StructRow, Vector } from 'apache-arrow'
import { DataType as ArrowDataType } from 'apache-arrow'
import { isNullOrUndefined } from './duckdb-common'

/** Data types used by ArrowJS. */
export type DataType =
  | null
  | boolean
  | number
  | string
  | Date // datetime
  | Int32Array // int
  | Uint8Array // bytes
  | Uint32Array // Decimal
  | Vector // arrays
  | StructRow // interval
  | Dictionary // categorical
  | Struct // dict
  | bigint // period

/** The type of the cell. */
export enum DataFrameCellType {
  // Index cells
  INDEX = 'index',
  // Data cells
  DATA = 'data',
}

/**
 * Converts an Arrow vector to a list of strings.
 *
 * @param vector The Arrow vector to convert.
 * @returns The list of strings.
 */
export function convertVectorToList(vector: Vector<any>): string[] {
  const values = []

  for (let i = 0; i < vector.length; i++) {
    values.push(vector.get(i))
  }
  return values
}

/** Returns the timezone of the arrow type metadata. */
export function getTimezone(field: Field): string | undefined {
  return field.type?.timezone ?? field.metadata?.get('timezone')
}

/**
 * True if the arrow type is an integer type.
 * For example: int8, int16, int32, int64, uint8, uint16, uint32, uint64, range
 */
export function isIntegerType(field?: Field): boolean {
  if (isNullOrUndefined(field)) {
    return false
  }

  return (
    // Period types are integers with an extra extension name
    (ArrowDataType.isInt(field.type) && !isPeriodType(field))
    || isUnsignedIntegerType(field)
  )
}

/** True if the arrow type is an unsigned integer type. */
export function isUnsignedIntegerType(field?: Field): boolean {
  if (isNullOrUndefined(field)) {
    return false
  }

  return (
    (ArrowDataType.isInt(field.type)
      && field.type.isSigned === false)
  )
}

/**
 * True if the arrow type is a float type.
 * For example: float16, float32, float64, float96, float128
 */
export function isFloatType(field?: Field): boolean {
  if (isNullOrUndefined(field)) {
    return false
  }
  return (
    (ArrowDataType.isFloat(field.type))
    ?? false
  )
}

/** True if the arrow type is a decimal type. */
export function isDecimalType(field?: Field): boolean {
  if (isNullOrUndefined(field)) {
    return false
  }
  return (
    ArrowDataType.isDecimal(field.type)
  )
}

/** True if the arrow type is a numeric type. */
export function isNumericType(type?: Field): boolean {
  if (isNullOrUndefined(type)) {
    return false
  }
  return isIntegerType(type) || isFloatType(type) || isDecimalType(type)
}

/** True if the arrow type is a boolean type. */
export function isBooleanType(type?: Field): boolean {
  if (isNullOrUndefined(type)) {
    return false
  }
  return (
    ArrowDataType.isBool(type.type)
  )
}

/** True if the arrow type is a duration type. */
export function isDurationType(type?: Field): boolean {
  if (isNullOrUndefined(type)) {
    return false
  }
  return (
    ArrowDataType.isDuration(type.type)
  )
}

/** True if the arrow type is a period type. */
export function isPeriodType(type?: Field): boolean {
  if (isNullOrUndefined(type)) {
    return false
  }
  return (
    (ArrowDataType.isInt(type.type)
      && type.metadata.get('ARROW:extension:name') === 'period')
  )
}

/** True if the arrow type is a datetime type. */
export function isDatetimeType(type?: Field): boolean {
  if (isNullOrUndefined(type)) {
    return false
  }
  return (
    ArrowDataType.isTimestamp(type.type)
  )
}

/** True if the arrow type is a date type. */
export function isDateType(type?: Field): boolean {
  if (isNullOrUndefined(type)) {
    return false
  }
  return (
    ArrowDataType.isDate(type.type)
  )
}

/** True if the arrow type is a time type. */
export function isTimeType(type?: Field): boolean {
  if (isNullOrUndefined(type)) {
    return false
  }
  return (
    ArrowDataType.isTime(type.type)
  )
}

/** True if the arrow type is a categorical type. */
export function isCategoricalType(type?: Field): boolean {
  if (isNullOrUndefined(type)) {
    return false
  }
  return (
    ArrowDataType.isDictionary(type.type)
  )
}

/** True if the arrow type is a list type. */
export function isListType(type?: Field): boolean {
  if (isNullOrUndefined(type)) {
    return false
  }
  return (
    ArrowDataType.isList(type.type)
    || ArrowDataType.isFixedSizeList(type.type)
  )
}

/** True if the arrow type is an object type. */
export function isObjectType(type?: Field): boolean {
  if (isNullOrUndefined(type)) {
    return false
  }
  return (
    ArrowDataType.isStruct(type.type)
    || ArrowDataType.isMap(type.type)
  )
}

/** True if the arrow type is a bytes type. */
export function isBytesType(type?: Field): boolean {
  if (isNullOrUndefined(type)) {
    return false
  }
  return (
    ArrowDataType.isBinary(type.type)
    || ArrowDataType.isLargeBinary(type.type)
  )
}

/** True if the arrow type is a string type. */
export function isStringType(type?: Field): boolean {
  if (isNullOrUndefined(type)) {
    return false
  }
  return (
    ArrowDataType.isUtf8(type.type)
    || ArrowDataType.isLargeUtf8(type.type)
  )
}

/** True if the arrow type is an empty type. */
export function isEmptyType(type?: Field): boolean {
  if (isNullOrUndefined(type)) {
    return false
  }
  return (
    ArrowDataType.isNull(type.type)
  )
}

/** True if the arrow type is a interval type. */
export function isIntervalType(type?: Field): boolean {
  if (isNullOrUndefined(type)) {
    return false
  }
  // ArrowDataType.isInterval checks for a different (unsupported) type and not related
  // to the pandas interval extension type.
  return (
    (ArrowDataType.isStruct(type.type)
      && type.metadata.get('ARROW:extension:name') === 'interval')
  )
}
