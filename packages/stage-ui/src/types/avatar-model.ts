import type { AvatarModelReference } from '@proj-airi/core-character'
import type { Live2DAvatarModelReference } from '@proj-airi/stage-ui-live2d/types/avatar-model'

/** Configuration placeholder for Avatar Model types without an editor contract. */
export type UnconfiguredAvatarModelReference<
  TType extends 'vrm' | 'mmd' | 'spine' | 'tachie',
> = AvatarModelReference<TType, Record<string, never>>

/** Avatar Model references that the current Character format can store. */
export type CharacterAvatarModelReference
  = | Live2DAvatarModelReference
    | UnconfiguredAvatarModelReference<'vrm'>
    | UnconfiguredAvatarModelReference<'mmd'>
    | UnconfiguredAvatarModelReference<'spine'>
    | UnconfiguredAvatarModelReference<'tachie'>
