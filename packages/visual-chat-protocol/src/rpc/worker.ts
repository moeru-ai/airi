export interface WorkerRpc {
  submitMedia: (wavData: Uint8Array, imageData?: Uint8Array) => void | Promise<void>
  health: () => Promise<boolean>
}
