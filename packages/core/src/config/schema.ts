import { z } from 'zod'

export const ProviderRef = z.object({
  id: z.string(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
})

export const ConfigSchema = z.object({
  providers: z.object({
    chat: ProviderRef.optional(),
    tts: z.object({ id: z.string(), voice: z.string().optional() }).optional(),
    stt: z.object({ id: z.string() }).optional(),
    vad: z.object({ id: z.string() }).optional(),
  }),
  scene: z.object({
    renderer: z.enum(['three', 'pixi']).default('three'),
    model: z.enum(['vrm', 'live2d', 'mmd']).default('vrm'),
  }),
}).strict()

export type AiriConfig = z.infer<typeof ConfigSchema>
