const pathRegex = /([^[.\]])+/g

/**
 * Retrieves the value at a given path within a provided object.
 *
 * @template T - The type of value to be returned
 *
 * @param {any} obj - The object to extract value from
 * @param {string | string[]} path - A path or an array of path where the value should be get from
 *
 * @returns {T | undefined} - The value at the given path in the object, or undefined if path is not found
 *
 * @example
 *
 * const obj = { a: { b: { c: 1 } } }
 *
 * const result = get(obj, 'a.b.c')
 *
 * console.log(result) // 1
 */
export function get<T>(obj: any, path: string | string[]): T | undefined {
  if (!path) {
    return undefined
  }

  const pathArray = Array.isArray(path)
    ? path
    : path.match(pathRegex)

  return pathArray?.reduce((prevObj, key) => prevObj && prevObj[key], obj)
}

/**
 * Sets a value at a given path within a provided object. If the path does not exist, nested objects will be created.
 *
 * @param {any} obj - The original object to set value in
 * @param {string | string[]} path - A path or an array of path where the value should be set
 * @param {any} value - The value to be set at the provided path
 *
 * @returns {void}
 *
 * @example
 * const obj = { a: { b: { c: 1 } } }
 *
 * set(obj, 'a.b.c', 2)
 *
 * console.log(obj) // { a: { b: { c: 2 } } }
 */
export function set(obj: any, path: string | string[], value: any): void {
  const pathArray = Array.isArray(path)
    ? path
    : path.match(pathRegex)

  if (pathArray) {
    pathArray.reduce((acc, key, i) => {
      if (acc[key] === undefined) {
        acc[key] = {}
      }
      if (i === pathArray.length - 1) {
        acc[key] = value
      }

      return acc[key]
    }, obj)
  }
}

/**
 * Omits given properties from a provided object.
 *
 * @template T - An object with string keys and any type of values
 *
 * @param {T} obj - The original object to omit properties from
 * @param {(keyof T)[]} properties - An array of property key names to omit from the base object
 *
 * @returns {Partial<T>} The new object with omitted properties
 *
 * @example
 * const obj = { a: 1, b: 2, c: 3 }
 * const propsToOmit = ['b', 'c']
 *
 * const newObj = omit(obj, propsToOmit)
 *
 * console.log(newObj) // { a: 1 }
 */
export function omit<T extends Record<string, any>>(obj: T, properties: (keyof T)[]): Partial<T> {
  const newObj = { ...obj }
  properties.forEach(prop => delete newObj[prop])
  return newObj
}
