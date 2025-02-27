export interface InitiateProgressInfo {
  status: 'initiate'
  name: string
  file: string
}

export interface DownloadProgressInfo {
  status: 'download'
  name: string
  file: string
}

export interface ProgressStatusInfo {
  status: 'progress'
  name: string
  file: string
  progress: number
  loaded: number
  total: number
}

export interface DoneProgressInfo {
  status: 'done'
  name: string
  file: string
}

export interface ReadyProgressInfo {
  status: 'ready'
  task: string
  model: string
}

export type ProgressInfo = InitiateProgressInfo | DownloadProgressInfo | ProgressStatusInfo | DoneProgressInfo | ReadyProgressInfo

export type ProgressCallback = (progress: ProgressInfo) => void
