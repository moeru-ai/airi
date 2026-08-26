export class LocalStorageShim implements Storage {
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

  get length() {
    return this.map.size
  }

  setItem(key: string, value: string) {
    this.map.set(key, value)
  }

  removeItem(key: string) {
    this.map.delete(key)
  }
}
