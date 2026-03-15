export interface Extensions extends Record<string, unknown> {
  /**
   * @default
   * ```ts
   * {
   *   depth: 4,
   *   prompt: '',
   *   role: 'system',
   * }
   * ```
   */
  depth_prompt?: ExtensionsDepthPrompt
  /** @default `false` */
  fav?: boolean
  /** @default `0.5` */
  talkativeness?: number
  /** @default `undefined` */
  world?: string
}

export interface ExtensionsDepthPrompt {
  depth: number
  prompt: string
  role: 'system' | ({} & string)
}
