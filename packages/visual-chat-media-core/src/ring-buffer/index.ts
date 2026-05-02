export class RingBuffer<T> {
  private buffer: (T | undefined)[]
  private writeIndex = 0
  private count = 0

  constructor(public readonly capacity: number) {
    if (capacity < 1)
      throw new Error('RingBuffer capacity must be >= 1')
    this.buffer = Array.from({ length: capacity })
  }

  write(item: T): void {
    this.buffer[this.writeIndex] = item
    this.writeIndex = (this.writeIndex + 1) % this.capacity
    if (this.count < this.capacity)
      this.count++
  }

  readLatest(n: number): T[] {
    const count = Math.min(n, this.count)
    const result: T[] = []

    for (let i = 0; i < count; i++) {
      const idx = (this.writeIndex - count + i + this.capacity) % this.capacity
      result.push(this.buffer[idx] as T)
    }

    return result
  }

  peek(): T | undefined {
    if (this.count === 0)
      return undefined
    const idx = (this.writeIndex - 1 + this.capacity) % this.capacity
    return this.buffer[idx]
  }

  get size(): number {
    return this.count
  }

  get isFull(): boolean {
    return this.count === this.capacity
  }

  clear(): void {
    this.buffer = Array.from({ length: this.capacity })
    this.writeIndex = 0
    this.count = 0
  }

  toArray(): T[] {
    return this.readLatest(this.count)
  }
}
