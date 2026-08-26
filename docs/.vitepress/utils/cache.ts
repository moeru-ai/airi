// adapted from https://stackoverflow.com/a/46432113/11613622
// eslint-disable-next-line ts/ban-ts-comment
// @ts-nocheck
export class LRUCache {
  cache
  max
  constructor(max = 10) {
    this.max = max
    this.cache = new Map()
  }

  clear() {
    this.cache.clear()
  }

  first() {
    return this.cache.keys().next().value
  }

  get(key) {
    const item = this.cache.get(key)
    if (item !== undefined) {
      // refresh key
      this.cache.delete(key)
      this.cache.set(key, item)
    }
    return item
  }

  set(key, val) {
    // refresh key
    if (this.cache.has(key))
      this.cache.delete(key)
      // evict oldest
    else if (this.cache.size === this.max)
      this.cache.delete(this.first())
    this.cache.set(key, val)
  }
}
