export interface MemoryTokenEstimator {
  estimate: (input: { text: string }) => number
}
