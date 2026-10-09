import { customType } from 'drizzle-orm/pg-core'

/**
 * A `jsonb` column that returns the value exactly as stored.
 *
 * The `jsonb` column of drizzle runs `JSON.parse` on every string that the
 * driver returns. The driver has already parsed the column, so a stored
 * string such as `"1.0"` comes back as the number `1`. Use this column when a
 * value can be a top-level string.
 */
export const jsonValue = customType<{ data: unknown, driverData: unknown }>({
  dataType: () => 'jsonb',
  toDriver: value => JSON.stringify(value),
  fromDriver: value => value,
})
