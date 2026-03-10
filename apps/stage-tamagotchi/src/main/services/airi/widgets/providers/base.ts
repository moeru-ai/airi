/**
 * Abstract Artistry Provider Interface
 *
 * All image generation providers (ComfyUI, Replicate, etc.) must implement
 * this interface. The bridge dispatches to the active provider based on
 * the current AIRI card's artistry settings.
 */

export interface ArtistryRequest {
  /** The text prompt describing the desired image */
  prompt: string
  /** Negative prompt — things to avoid (provider support varies) */
  negativePrompt?: string
  /** Image width in pixels */
  width?: number
  /** Image height in pixels */
  height?: number
  /** Provider-specific model identifier */
  model?: string
  /** Provider-specific extras (e.g. remixId, checkpoint, seed, aspect_ratio) */
  extra?: Record<string, any>
}

export interface ArtistryJob {
  /** Internal job ID for tracking */
  jobId: string
  /** Provider's native job/prediction ID */
  providerJobId: string
}

export type ArtistryJobStatusType = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface ArtistryJobStatus {
  status: ArtistryJobStatusType
  /** Generation progress 0-100 (not all providers support this) */
  progress?: number
  /** Final output image URL */
  imageUrl?: string
  /** Error message if failed */
  error?: string
  /** Human-readable label of current stage (e.g. "Sampling", "VAE Decode") */
  actionLabel?: string
}

export interface ArtistryProviderConfig {
  /** Unique provider ID (e.g. "comfyui", "replicate") */
  id: string
  /** Human-readable display name */
  name: string
  /** Provider-specific configuration (API keys, paths, etc.) */
  settings: Record<string, any>
}

export interface ArtistryProvider {
  /** Unique provider ID */
  readonly id: string
  /** Human-readable display name */
  readonly name: string

  /**
   * Start an image generation job.
   * Returns a job handle for tracking.
   */
  generate(request: ArtistryRequest): Promise<ArtistryJob>

  /**
   * Poll the current status of a running job.
   * Returns status, progress, and final image URL when done.
   */
  getStatus(jobId: string): Promise<ArtistryJobStatus>

  /**
   * Cancel a running job (optional — not all providers support this).
   */
  cancel?(jobId: string): Promise<void>

  /**
   * Called when the provider is first initialized with its config.
   */
  initialize?(config: ArtistryProviderConfig): Promise<void>

  /**
   * Clean up resources when the provider is being switched out.
   */
  dispose?(): void
}

/**
 * Per-card artistry settings stored in AiriExtension.modules.artistry
 */
export interface ArtistryModuleSettings {
  /** Active provider ID (e.g. "comfyui", "replicate") */
  provider?: string
  /** Provider-specific model identifier */
  model?: string
  /** String prepended to every LLM-generated prompt for style consistency */
  defaultPromptPrefix?: string
  /**
   * Free-form provider-specific options as a JSON object.
   * For Replicate: { go_fast: true, megapixels: "1", aspect_ratio: "16:9", ... }
   * For ComfyUI:   { remixId: 48250602, checkpoint: "bunnyMint.safetensors" }
   */
  providerOptions?: Record<string, any>
}
