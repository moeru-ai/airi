import type { HttpError } from '../../errors'

export interface ExtensionAssetTokenIssueInput {
  extensionId: string
  version: string
  sessionId: string
  pathPrefix: string
  ttlMs: number
}

export interface ExtensionAssetTokenValidateInput {
  extensionId: string
  version?: string
  assetPath: string
}

export type ExtensionAssetTokenValidationResult
  = | { ok: true }
    | { ok: false, error: HttpError }

export interface ExtensionAssetTokenStore {
  issue: (input: ExtensionAssetTokenIssueInput) => string
  validate: (token: string, input: ExtensionAssetTokenValidateInput) => ExtensionAssetTokenValidationResult
  revokeByExtensionId: (extensionId: string) => void
  revokeAll: () => void
}

export type ExtensionStaticAssetResolveResult
  = | { ok: true, filePath: string, size: number, mtime: number }
    | { ok: false, error: HttpError }

export interface ExtensionStaticAssetRouteOptions {
  authorize: (params: { token: string, extensionId: string, assetPath: string }) => Promise<ExtensionAssetTokenValidationResult>
  resolveAsset: (params: { extensionId: string, assetPath: string }) => Promise<ExtensionStaticAssetResolveResult>
  getType?: (ext: string) => string | undefined
}
