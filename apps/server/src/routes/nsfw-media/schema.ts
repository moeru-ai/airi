import { array, literal, object, optional, record, string, union, unknown } from 'valibot'

export const CreateImageJobSchema = object({
  characterId: string(),
  route: union([literal('normal'), literal('nsfw')]),
  prompt: string(),
  negativePrompt: string(),
  sceneType: optional(string()),
  tags: array(string()),
  params: optional(record(string(), unknown())),
})

export const CreateGalleryItemSchema = object({
  characterId: string(),
  imageJobId: optional(string()),
  mediaId: optional(string()),
  title: optional(string()),
  prompt: string(),
  negativePrompt: string(),
  sceneType: optional(string()),
  tags: array(string()),
})
