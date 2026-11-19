/** Emotion labels shared by bundled artwork, imports, and the model catalog. */
export const stickerEmotions = ['happy', 'sad', 'confused', 'surprised', 'thanks', 'celebrate', 'angry', 'tired', 'affectionate', 'awkward', 'agree', 'disagree'] as const

export type StickerEmotion = typeof stickerEmotions[number]

/** Mutable library entry. Its image identity changes only when a custom image is replaced. */
export interface StickerEntry {
  id: string
  assetId: string
  name: string
  emotions: StickerEmotion[]
  deleted: boolean
}
