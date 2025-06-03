import { toRaw } from 'vue'

export function toRawObject<T>(obj: T): T {
  /*
  This function can be used to convert an object into a Raw object. It will recussively convert all the values inside it.
  The returned object will be a Raw object with all its compatible values converted into Raw objects.
  */
  if (typeof obj !== 'object' || obj === null) {
    // Seems to be a primitive value or undefined
    return obj
  }

  // Thanks to vue's toRaw function, we can only keep the basic values, removing useless Proxies
  const raw = toRaw(obj)

  if (Array.isArray(raw)) { // In case we are working with an array, stored data can be checked as well
    return raw.map(item => toRawObject(item))
  }

  // We're not working on an array, so we can check the defined properties of the "custom" object
  const cleanObj = {} as T
  for (const key in raw) {
    cleanObj[key] = toRawObject(raw[key])
  }

  return cleanObj // And voilà, a nice raw object that can be easily structuredClone()-ed
}
