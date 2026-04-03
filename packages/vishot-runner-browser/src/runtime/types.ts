export interface CaptureBrowserCliArguments {
  renderEntry: string
  outputDir: string
  rootNames: string[]
}

export interface BrowserCaptureRequest {
  sceneAppRoot?: string
  baseUrl?: string
  routePath: string
  outputDir: string
  rootNames?: string[]
  viewport?: {
    width: number
    height: number
    deviceScaleFactor?: number
  }
}

export interface CapturedRootArtifact {
  rootName: string
  filePath: string
}
