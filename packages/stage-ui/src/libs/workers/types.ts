export interface EventLoading {
  status: 'loading'
  data: string
}

export interface EventInitiate {
  status: 'initiate'
  name: string
  file: string
  // Not used
  progress?: number
  loaded?: number
  total?: number
}

export interface EventDownload {
  status: 'download'
  name: string
  file: string
  // Not used
  progress?: number
  loaded?: number
  total?: number
}

export interface EventProgress {
  status: 'progress'
  name: string
  file: string
  progress: number
  loaded: number
  total: number
}

export interface EventDone {
  status: 'done'
  name: string
  file: string
  // Not used
  progress?: number
  loaded?: number
  total?: number
}

export interface EventReady {
  status: 'ready'
}

export interface EventStart {
  status: 'start'
}

export interface EventUpdate {
  status: 'update'
  tps: number
  output: string
  numTokens: number
}

export interface EventComplete {
  status: 'complete'
  output: string[]
}

export type MessageEvents = EventLoading | EventInitiate | EventDownload | EventProgress | EventDone | EventReady | EventStart | EventUpdate | EventComplete
export type ProgressMessageEvents = EventInitiate | EventProgress | EventDone

export interface MessageGenerate {
  type: 'generate'
  data: {
    audio: string
    language: string
  }
}
