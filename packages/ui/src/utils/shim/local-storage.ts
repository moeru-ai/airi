export class LocalStorageShim implements Storage {
  get length() {
    return this.map.size
  }

  private map = new Map<string, any>()

  clear() {
    this.map.clear()
  }

  getItem(key: string) {
    return this.map.get(key) || null
  }

  key(index: number) {
    return Array.from(this.map.keys())[index] || null
  }

  removeItem(key: string) {
    this.map.delete(key)
  }

  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
}
