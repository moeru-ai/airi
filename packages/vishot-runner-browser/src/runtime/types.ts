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
  settleMs?: number
  rootNames?: string[]
  imageTransformers?: ArtifactTransformer[]
  viewport?: {
    width: number
    height: number
    deviceScaleFactor?: number
  }
}
export type VishotArtifactKind = 'image'
export type VishotArtifactStage = 'browser-final' | 'electron-raw'

export interface VishotArtifact {
  kind: VishotArtifactKind
  stage: VishotArtifactStage
  artifactName: string
  filePath: string
  format: string
  metadata?: Record<string, unknown>
}

export type ArtifactTransformer = (
  artifact: VishotArtifact,
) => Promise<VishotArtifact | VishotArtifact[]>
