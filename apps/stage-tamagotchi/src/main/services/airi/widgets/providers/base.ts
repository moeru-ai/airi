/**
 * Abstract Artistry Provider Interface
 *
 * All image generation providers (ComfyUI, Replicate, etc.) must implement
 * this interface. The bridge dispatches to the active provider based on
 * the current AIRI card's artistry settings.
 */

export interface ArtistryJob {
  /** Internal job ID for tracking */
  jobId: string
  /** Provider's native job/prediction ID */
  providerJobId: string
}

export interface ArtistryJobStatus {
  /** Human-readable label of current stage (e.g. "Sampling", "VAE Decode") */
  actionLabel?: string
  /** Error message if failed */
  error?: string
  /** Final output image URL */
  imageUrl?: string
  /** Generation progress 0-100 (not all providers support this) */
  progress?: number
  status: ArtistryJobStatusType
}

export type ArtistryJobStatusType = 'cancelled' | 'failed' | 'queued' | 'running' | 'succeeded'

/**
 * Per-card artistry settings stored in AiriExtension.modules.artistry
 */
export interface ArtistryModuleSettings {
  /** String prepended to every LLM-generated prompt for style consistency */
  defaultPromptPrefix?: string
  /** Provider-specific model identifier */
  model?: string
  /** Active provider ID (e.g. "comfyui", "replicate") */
  provider?: string
  /**
   * Free-form provider-specific options as a JSON object.
   * For Replicate: { go_fast: true, megapixels: "1", aspect_ratio: "16:9", ... }
   * For ComfyUI:   { remixId: 48250602, checkpoint: "bunnyMint.safetensors" }
   */
  providerOptions?: Record<string, any>
}

export interface ArtistryProvider {
  /**
   * Cancel a running job (optional — not all providers support this).
   */
  cancel?: (jobId: string) => Promise<void>
  /**
   * Clean up resources when the provider is being switched out.
   */
  dispose?: () => void

  /**
   * Start an image generation job.
   * Returns a job handle for tracking.
   */
  generate: (request: ArtistryRequest) => Promise<ArtistryJob>

  /**
   * Poll the current status of a running job.
   * Returns status, progress, and final image URL when done.
   */
  getStatus: (jobId: string) => Promise<ArtistryJobStatus>

  /** Unique provider ID */
  readonly id: string

  /**
   * Called when the provider is first initialized with its config.
   */
  initialize?: (config: Record<string, any>) => Promise<void>

  /** Human-readable display name */
  readonly name: string

  /**
   * Optional push callback for providers that stream or callback status updates.
   */
  setJobCallback?: (jobId: string, callback: (status: ArtistryJobStatus) => void) => void
}

export interface ArtistryProviderConfig {
  /** Unique provider ID (e.g. "comfyui", "replicate") */
  id: string
  /** Human-readable display name */
  name: string
  /** Provider-specific configuration (API keys, paths, etc.) */
  settings: Record<string, any>
}

export interface ArtistryRequest {
  /** Provider-specific extras (e.g. remixId, checkpoint, seed, aspect_ratio) */
  extra?: Record<string, any>
  /** Image height in pixels */
  height?: number
  /** Provider-specific model identifier */
  model?: string
  /** Negative prompt — things to avoid (provider support varies) */
  negativePrompt?: string
  /** The text prompt describing the desired image */
  prompt: string
  /** Image width in pixels */
  width?: number
}
