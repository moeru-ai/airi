export const colorFromValues = ['red', 'yellow', 'green', 'blue', 'indigo', 'purple', 'pink', 'gray']
export const colorToValues = ['red', 'yellow', 'green', 'blue', 'indigo', 'purple', 'pink', 'gray']
export const sdkValues = ['gradio', 'streamlit', 'docker', 'static']
export const suggestedStorageValues = ['small', 'medium', 'large']
export const headerValues = ['mini', 'default']
export const licenseValues = [
  'apache-2.0',
  'mit',
  'openrail',
  'bigscience-openrail-m',
  'creativeml-openrail-m',
  'bigscience-bloom-rail-1.0',
  'bigcode-openrail-m',
  'afl-3.0',
  'artistic-2.0',
  'bsl-1.0',
  'bsd',
  'bsd-2-clause',
  'bsd-3-clause',
  'bsd-3-clause-clear',
  'c-uda',
  'cc',
  'cc0-1.0',
  'cc-by-2.0',
  'cc-by-2.5',
  'cc-by-3.0',
  'cc-by-4.0',
  'cc-by-sa-3.0',
  'cc-by-sa-4.0',
  'cc-by-nc-2.0',
  'cc-by-nc-3.0',
  'cc-by-nc-4.0',
  'cc-by-nd-4.0',
  'cc-by-nc-nd-3.0',
  'cc-by-nc-nd-4.0',
  'cc-by-nc-sa-2.0',
  'cc-by-nc-sa-3.0',
  'cc-by-nc-sa-4.0',
  'cdla-sharing-1.0',
  'cdla-permissive-1.0',
  'cdla-permissive-2.0',
  'wtfpl',
  'ecl-2.0',
  'epl-1.0',
  'epl-2.0',
  'etalab-2.0',
  'eupl-1.1',
  'agpl-3.0',
  'gfdl',
  'gpl',
  'gpl-2.0',
  'gpl-3.0',
  'lgpl',
  'lgpl-2.1',
  'lgpl-3.0',
  'isc',
  'lppl-1.3c',
  'ms-pl',
  'apple-ascl',
  'mpl-2.0',
  'odc-by',
  'odbl',
  'openrail++',
  'osl-3.0',
  'postgresql',
  'ofl-1.1',
  'ncsa',
  'unlicense',
  'zlib',
  'pddl',
  'lgpl-lr',
  'deepfloyd-if-license',
  'llama2',
  'llama3',
  'llama3.1',
  'llama3.2',
  'llama3.3',
  'gemma',
  'unknown',
  'other',
]

export type License = 'apache-2.0' | 'mit' | 'openrail' | 'bigscience-openrail-m' | 'creativeml-openrail-m'
  | 'bigscience-bloom-rail-1.0' | 'bigcode-openrail-m' | 'afl-3.0' | 'artistic-2.0' | 'bsl-1.0' | 'bsd'
  | 'bsd-2-clause' | 'bsd-3-clause' | 'bsd-3-clause-clear' | 'c-uda' | 'cc' | 'cc0-1.0' | 'cc-by-2.0'
  | 'cc-by-2.5' | 'cc-by-3.0' | 'cc-by-4.0' | 'cc-by-sa-3.0' | 'cc-by-sa-4.0' | 'cc-by-nc-2.0'
  | 'cc-by-nc-3.0' | 'cc-by-nc-4.0' | 'cc-by-nd-4.0' | 'cc-by-nc-nd-3.0' | 'cc-by-nc-nd-4.0'
  | 'cc-by-nc-sa-2.0' | 'cc-by-nc-sa-3.0' | 'cc-by-nc-sa-4.0' | 'cdla-sharing-1.0' | 'cdla-permissive-1.0'
  | 'cdla-permissive-2.0' | 'wtfpl' | 'ecl-2.0' | 'epl-1.0' | 'epl-2.0' | 'etalab-2.0' | 'eupl-1.1'
  | 'agpl-3.0' | 'gfdl' | 'gpl' | 'gpl-2.0' | 'gpl-3.0' | 'lgpl' | 'lgpl-2.1' | 'lgpl-3.0' | 'isc'
  | 'lppl-1.3c' | 'ms-pl' | 'apple-ascl' | 'mpl-2.0' | 'odc-by' | 'odbl' | 'openrail++' | 'osl-3.0'
  | 'postgresql' | 'ofl-1.1' | 'ncsa' | 'unlicense' | 'zlib' | 'pddl' | 'lgpl-lr' | 'deepfloyd-if-license'
  | 'llama2' | 'llama3' | 'llama3.1' | 'llama3.2' | 'llama3.3' | 'gemma' | 'unknown' | 'other'

export interface SpaceConfiguration {
  /**
   * Display title for the Space.
   */
  title?: string

  /**
   * License
   *
   * Model Cards
   * https://huggingface.co/docs/hub/model-cards#model-card-metadata
   */
  license?: License | License[]

  /**
   * Space emoji (emoji-only character allowed).
   */
  emoji?: string

  /**
   * Color for Thumbnail gradient (red, yellow, green, blue, indigo, purple, pink, gray).
   */
  colorFrom?: 'red' | 'yellow' | 'green' | 'blue' | 'indigo' | 'purple' | 'pink' | 'gray'

  /**
   * Color for Thumbnail gradient (red, yellow, green, blue, indigo, purple, pink, gray).
   */
  colorTo?: 'red' | 'yellow' | 'green' | 'blue' | 'indigo' | 'purple' | 'pink' | 'gray'

  /**
   * Can be either gradio, streamlit, docker, or static.
   */
  sdk?: 'gradio' | 'streamlit' | 'docker' | 'static'

  /**
   * Any valid Python 3.x or 3.x.x version.
   * Defaults to 3.10.
   *
   * @default "3.10"
   */
  python_version?: string

  /**
   * Specify the version of the selected SDK (Streamlit or Gradio).
   * All versions of Gradio are supported.
   * All versions of Streamlit from 0.79.0 are supported.
   */
  sdk_version?: string

  /**
   * Specify the suggested hardware on which this Space must be run.
   * Useful for Spaces that are meant to be duplicated by other users.
   *
   * Setting this value will not automatically assign an hardware to this Space.
   *
   * Value must be a valid hardware flavor. Current valid hardware flavors:
   *
   * - CPU: `cpu-basic`, `cpu-upgrade`
   * - GPU: `t4-small`, `t4-medium`, `l4x1`, `l4x4`, `a10g-small`, `a10g-large`, `a10g-largex2`, `a10g-largex4`,`a100-large`
   * - TPU: `v5e-1x1`, `v5e-2x2`, `v5e-2x4`
   */
  suggested_hardware?: string

  /**
   * Specify the suggested permanent storage on which this Space must be run.
   * Useful for Spaces that are meant to be duplicated by other users.
   * Setting this value will not automatically assign a permanent storage to this Space.
   * Value must be one of "small", "medium" or "large".
   */
  suggested_storage?: 'small' | 'medium' | 'large'

  /**
   * Path to your main application file (which contains either gradio or streamlit Python code, or static html code).
   * Path is relative to the root of the repository.
   *
   * @default "index.html"
   */
  app_file?: string

  /**
   * Port on which your application is running. Used only if sdk is docker.
   *
   * Default port is 7860.
   *
   * @default 7860
   */
  app_port?: number

  /**
   * For non-static Spaces, initial url to render.
   * Needs to start with /.
   * For static Spaces, use app_file instead.
   */
  base_path?: string

  /**
   * Whether your Space is rendered inside a full-width (when true) or fixed-width column (ie. “container” CSS) inside the iframe.
   * Defaults to true.
   *
   * @default true
   */
  fullWidth?: boolean

  /**
   * Can be either mini or default. If header is set to mini the space
   * will be displayed full-screen with a mini floating header .
   */
  header?: 'mini' | 'default'

  /**
   * A short description of the Space. This will be displayed in the Space’s thumbnail.
   *
   * Must less or equal to 60 characters.
   */
  short_description?: string

  /**
   * HF model IDs (like `openai-community/gpt2` or `deepset/roberta-base-squad2`) used in
   * the Space.
   *
   * Will be parsed automatically from your code if not specified here.
   *
   * ```yaml
   * models:
   * - openai-community/gpt2
   * - deepset/roberta-base-squad2
   * ```
   */
  models?: string[]

  /**
   * HF dataset IDs (like `mozilla-foundation/common_voice_13_0` or `oscar-corpus/OSCAR-2109`)
   * used in the Space.
   *
   * Will be parsed automatically from your code if not specified here.
   *
   * ```yaml
   * datasets:
   * - mozilla-foundation/common_voice_13_0
   * - oscar-corpus/OSCAR-2109
   * ```
   */
  datasets?: string[]

  /**
   * List of terms that describe your Space task or scope.
   */
  tags?: string[]

  /**
   * URL for defining a custom thumbnail for social sharing.
   */
  thumbnail?: string

  /**
   * Whether the Space stays on top of your profile.
   *
   * Can be useful if you have a lot of Spaces so you and others can quickly see your best Space.
   *
   * @default false
   */
  pinned?: boolean

  /**
   * Whether a connected OAuth app is associated to this Space. See Adding a
   * Sign-In with HF button to your Space for more details.
   *
   * @default false
   */
  hf_oauth?: boolean

  /**
   * Authorized scopes of the connected OAuth app. `openid` and `profile` are authorized
   * by default and do not need this parameter. See Adding a Sign-In
   * with HF button to your space for more details.
   *
   * @default ["openid","profile"]
   */
  hf_oauth_scopes?: string[]

  /**
   * Duration of the OAuth token in minutes.
   *
   * Defaults to 480 minutes (8 hours). Maximum duration is 43200 minutes (30 days).
   * See Adding a Sign-In with HF button to your space for more details.
   *
   * @default 480
   */
  hf_oauth_expiration_minutes?: number

  /**
   * Whether the Space iframe can be embedded in other websites.
   *
   * Defaults to false, i.e. Spaces can be embedded.
   *
   * @default false
   */
  disable_embedding?: boolean

  /**
   * Set a custom startup duration timeout for your Space.
   *
   * This is the maximum time your Space is allowed to start before it times out
   * and is flagged as unhealthy.
   *
   * Defaults to 30 minutes, but any valid duration (like 1h, 30m) is acceptable.
   *
   * @default "30m"
   */
  startup_duration_timeout?: string

  /**
   * Set custom HTTP headers that will be added to all HTTP responses when serving your Space.
   * For now, only the cross-origin-embedder-policy (COEP), cross-origin-opener-policy (COOP),
   * and cross-origin-resource-policy (CORP) headers are allowed.
   * These headers can be used to set up a cross-origin isolated environment and enable powerful
   * features like SharedArrayBuffer, for example:
   *
   * ```yaml
   * custom_headers:
   *   cross-origin-embedder-policy: require-corp
   *   cross-origin-opener-policy: same-origin
   *   cross-origin-resource-policy: cross-origin
   * ```
   *
   * Note: all headers and values must be lowercase.
   */
  custom_headers?: Record<string, string>

  /**
   * Specify a list of Hugging Face Hub models or other large files to be preloaded during the build
   * time of your Space.
   *
   * This optimizes the startup time by having the files ready when your application starts.
   * This is particularly useful for Spaces that rely on large models or datasets that would otherwise
   * need to be downloaded at runtime.
   *
   * The format for each item is "repository_name" to download all files from a repository, or "repository_name file1,file2"
   *  for downloading specific files within that repository.
   *
   * You can also specify a specific commit to download using the format "repository_name file1,file2 commit_sha256".
   */
  preload_from_hub?: string[]
}
