export interface TwitterService {
  [key: string]: (...args: any[]) => any
}

export interface TwitterServices {
  [key: string]: TwitterService
}
