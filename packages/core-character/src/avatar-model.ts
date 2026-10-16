/** Avatar model types that a character definition can own. */
export const avatarModelTypes = [
  'live2d',
  'vrm',
  'mmd',
  'spine',
  'tachie',
] as const

/** Identifies the configuration family of an avatar model. */
export type AvatarModelType = typeof avatarModelTypes[number]

/**
 * References one display-model resource from a character definition.
 *
 * The character creator sets the identity and type. Editors can replace the
 * configuration, but they cannot change the reference into another type.
 *
 * @param TType Avatar model type that selects the configuration contract.
 * @param TConfig Configuration contract that the selected type owns.
 */
export interface AvatarModelReference<
  TType extends AvatarModelType = AvatarModelType,
  TConfig = unknown,
> {
  /** Stable identity inside the owning character. */
  readonly id: string
  /** Display-model resource that contains the model files. */
  readonly displayModelId: string
  /** Model type that selects the configuration and capability contracts. */
  readonly type: TType
  /** Type-specific character configuration for this reference. */
  readonly config: TConfig
}
