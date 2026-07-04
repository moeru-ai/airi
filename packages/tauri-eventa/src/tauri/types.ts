export interface IpcRendererMessage {
  cmd: string
  callback: number
  error: number
  payload: any
  options?: any
}

export interface TauriInternals {
  ipc: (message: IpcRendererMessage) => void
  invoke: (cmd: string, payload?: any, options?: any) => Promise<any>
  transformCallback: (fn: Function, once?: boolean) => number
  unregisterCallback: (id: number) => void
  convertFileSrc: (path: string, protocol?: string) => string
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: TauriInternals
  }
}

export type IpcRendererLike = Parameters<typeof import('@moeru/eventa/adapters/electron/renderer').createContext>[0]
