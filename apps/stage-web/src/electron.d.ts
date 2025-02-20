declare interface Window {
  electron: {
    ipcRenderer: {
      send: (channel: string, ...args: any[]) => void
    }
  }
}
