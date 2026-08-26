import { defineInvokeEventa } from '@moeru/eventa'

export interface ArtistrySyncPayload {
  globals: any
  // Card-level defaults to ensure widget triggers respect character settings
  model?: string
  options?: Record<string, any>
  promptPrefix?: string
  provider: string
}
export const ARTISTRY_SYNC_CONFIG_ADDRESS = 'eventa:invoke:electron:artistry:sync-config'
export const ARTISTRY_TEST_COMFYUI_CONNECTION_ADDRESS = 'eventa:invoke:electron:artistry:test-comfyui-connection'

export const artistrySyncConfig = defineInvokeEventa<void, ArtistrySyncPayload>(ARTISTRY_SYNC_CONFIG_ADDRESS)

export interface ArtistryTestComfyUIResult {
  info?: string
  isCors?: boolean
  ok: boolean
}
export const artistryTestComfyUIConnection = defineInvokeEventa<ArtistryTestComfyUIResult, { url: string }>(ARTISTRY_TEST_COMFYUI_CONNECTION_ADDRESS)

export const artistryGenerateHeadless = defineInvokeEventa<{ base64?: string, error?: string, imageUrl?: string }, { globals?: Record<string, any>, model?: string, options?: Record<string, any>, prompt: string, provider?: string }>('eventa:invoke:electron:artistry:generate-headless')

export const REPLICATE_IMAGEGEN_PRESETS = [
  {
    cost: '$1 / 200 imgs',
    id: 'prunaai/p-image',
    label: 'p-image',
    preset: {
      aspect_ratio: '16:9',
    },
    prompt: 'A high-quality anime-style illustration with professional shading, vibrant colors, hand-drawn aesthetic, highly detailed,',
  },
  {
    cost: '$1 / 200 imgs',
    id: 'prunaai/z-image-turbo',
    label: 'z-turbo',
    preset: {
      guidance_scale: 0,
      height: 768,
      num_inference_steps: 8,
      output_format: 'jpg',
      output_quality: 80,
      width: 1024,
    },
    prompt: 'A highly detailed anime illustration, crisp lines, vibrant color palette, professional digital art style, nicely shaded,',
  },
  {
    cost: '$1 / 333 imgs',
    id: 'black-forest-labs/flux-schnell',
    label: 'flux-schnell',
    preset: {
      aspect_ratio: '1:1',
      go_fast: true,
      num_outputs: 1,
      output_format: 'webp',
      output_quality: 80,
    },
    prompt: 'A stunning, high-definition anime scene, professional cel-shading, vibrant atmosphere, hand-drawn quality,',
  },
  {
    cost: '$1 / 217 imgs',
    id: 'prunaai/z-image-turbo-lora:197b2db2015aa366d2bc61a941758adf4c31ac66b18573f5c66dc388ab081ca2',
    label: 'z-turbo-lora',
    preset: {
      guidance_scale: 0,
      height: 1024,
      lora_scales: [1],
      lora_weights: ['https://huggingface.co/renderartist/Technically-Color-Z-Image-Turbo/resolve/main/Technically_Color_Z_Image_Turbo_v1_renderartist_2000.safetensors'],
      num_inference_steps: 8,
      output_format: 'jpg',
      output_quality: 80,
      width: 1024,
    },
    prompt: 'A beautifully rendered anime illustration in a classic hand-drawn style, rich textures, vibrant colors, masterpiece quality,',
  },
  {
    cost: '$1 / 151 imgs',
    id: 'aisha-ai-official/wai-nsfw-illustrious-v11:c1d5b02687df6081c7953c74bcc527858702e8c153c9382012ccc3906752d3ec',
    label: 'wai-ilx',
    preset: {
      batch_size: 1,
      cfg_scale: 7,
      clip_skip: 2,
      guidance_rescale: 0.5,
      height: 1024,
      model: 'WAI-NSFW-illustrious-SDXL-v11',
      negative_prompt: 'nsfw, naked',
      pag_scale: 3,
      prepend_preprompt: true,
      scheduler: 'Euler a',
      seed: -1,
      steps: 30,
      vae: 'default',
      width: 1024,
    },
    prompt: 'high quality, masterpiece, hirez, absurdres, anime style, highly detailed, vibrant colors, aesthetic,',
  },
  {
    cost: '$1 / 188 imgs',
    id: 'aisha-ai-official/anillustrious-v4:80441e2c32a55f2fcf9b77fa0a74c6c86ad7deac51eed722b9faedb253265cb4',
    label: 'anillustrious',
    preset: {
      adetailer_face: false,
      adetailer_face_negative_prompt: '',
      adetailer_face_prompt: '',
      adetailer_hand: false,
      adetailer_hand_negative_prompt: '',
      adetailer_hand_prompt: '',
      adetailer_person: false,
      adetailer_person_negative_prompt: '',
      adetailer_person_prompt: '',
      cfg_scale: 7,
      clip_skip: 2,
      guidance_rescale: 1,
      height: 1024,
      model: 'Anillustrious-v4',
      negative_prompt: 'nsfw, naked',
      negative_prompt_conjunction: false,
      pag_scale: 0,
      prepend_preprompt: true,
      prompt_conjunction: true,
      refiner: false,
      refiner_prompt: '',
      refiner_strength: 0.8,
      scheduler: 'Euler a beta',
      seed: -1,
      steps: 30,
      upscale: 'Original',
      vae: 'default',
      width: 1024,
    },
    prompt: 'high quality, masterpiece, hirez, absurdres, anime style, detailed background, atmospheric, beautifully shaded,',
  },
]

export const REPLICATE_IMAGEEDIT_PRESETS = [
  {
    cost: 'Turbo',
    id: 'prunaai/p-image-edit',
    label: 'P-Image-Edit (Texture Swapper)',
    preset: {
      aspect_ratio: '1:1',
      images: [{ value: '{{IMAGE}}' }],
      turbo: true,
    },
    prompt: 'The woman\'s dress is changed to black',
  },
]
export const ARTISTRY_PRESET_GROUPS = [
  {
    icon: 'i-solar:palette-bold-duotone',
    id: 'fabrics',
    label: 'Fabric Lab',
    presets: [
      { icon: 'i-solar:star-bold-duotone', id: 'gold', label: 'Gold Leaf', text: 'Divine Golden transformation. Pure white velvet fabric with thick 24k gold leaf embroidery and glowing white celestial patterns.' },
      { icon: 'i-solar:ghost-bold-duotone', id: 'gothic', label: 'Midnight Gothic', text: 'Midnight Gothic style. Deep matte black fabric, crimson lace ruffles, dark leather straps, silver scrollwork embroidery.' },
      { icon: 'i-solar:crown-minimalistic-bold-duotone', id: 'royal', label: 'Royal Porcelain', text: 'Royal Porcelain style. White silk base, hand-painted cobalt blue patterns, golden silk sashes, jade ornaments.' },
      { icon: 'i-solar:t-shirt-bold-duotone', id: 'denim', label: 'Raw Indigo Denim', text: 'Heavyweight dark indigo denim with thick orange contrast stitching and realistic weathered fading.' },
      { icon: 'i-solar:widget-bold-duotone', id: 'plaid', label: 'Classic Tartan Plaid', text: 'Traditional red and green Scottish wool plaid with a visible woven texture and cozy feel.' },
      { icon: 'i-solar:water-drops-bold-duotone', id: 'satin', label: 'Powder Blue Satin', text: 'Highly reflective, pale baby blue silk with smooth flowing "liquid" highlights and high luster.' },
      { icon: 'i-solar:shield-bold-duotone', id: 'hex', label: 'Tactical Hex-Grid', text: 'Matte olive drab fabric with a subtle hexagonal heat-pressed grid pattern and dark grey utility straps.' },
      { icon: 'i-solar:skateboarding-bold-duotone', id: 'camo', label: 'Cyber Pink Camo', text: 'Vibrant hot pink and charcoal grey urban camouflage with a slight tech-fabric sheen.' },
    ],
  },
  {
    icon: 'i-solar:scissors-bold-duotone',
    id: 'hair',
    label: 'Hair Salon',
    presets: [
      { icon: 'i-solar:snowflake-bold-duotone', id: 'silver', label: 'Iridescent Silver', text: 'Pure white hair with subtle prismatic "oil-slick" highlights that catch the light.' },
      { icon: 'i-solar:moon-bold-duotone', id: 'onyx', label: 'Onyx Gloss', text: 'Pitch black hair with a high-mirror shine and sharp, high-contrast highlights.' },
      { icon: 'i-solar:sun-2-bold-duotone', id: 'sunset', label: 'Sunset Ombre', text: 'Vibrant gradient from deep copper roots to fiery orange and golden blonde tips.' },
      { icon: 'i-solar:leaf-bold-duotone', id: 'mint', label: 'Ghost Mint', text: 'Soft, matte pastel mint green with a "cloud-like" ethereal texture.' },
      { icon: 'i-solar:heart-bold-duotone', id: 'pink', label: 'Bubblegum Pop', text: 'High-gloss, vibrant candy pink with a plastic-like shine and white "rim" highlights.' },
      { icon: 'i-solar:filters-bold-duotone', id: 'rainbow', label: 'Retrowave Rainbow', text: 'Multi-colored "raver girl" hair; dark roots with glowing neon streaks of cyan, magenta, and lime green.' },
    ],
  },
  {
    icon: 'i-solar:eye-bold-duotone',
    id: 'eyes',
    label: 'Iris Forge',
    presets: [
      { icon: 'i-solar:fire-bold-duotone', id: 'dragon', label: 'Dragon Slit', text: 'Glowing orange irises with vertical black slit pupils and a subtle reptilian texture.' },
      { icon: 'i-solar:heart-angle-bold-duotone', id: 'heart', label: 'Succubus Heart', text: 'Soft pink irises with glowing white heart-shaped pupils and a "love-struck" aura.' },
      { icon: 'i-solar:star-fall-bold-duotone', id: 'star', label: 'Celestial Star', text: 'Deep violet eyes with white star-shaped pupils and a subtle ring of stardust.' },
      { icon: 'i-solar:atom-bold-duotone', id: 'galaxy', label: 'Nebula Galaxy', text: 'Deep space irises containing tiny sparkling stars and purple nebula clusters.' },
      { icon: 'i-solar:scanner-2-bold-duotone', id: 'cyber-eye', label: 'Cyber Scan', text: 'Glowing cyan HUD-style eyes with digital scanning rings and data-stream pupils.' },
    ],
  },
  {
    icon: 'i-solar:magic-stick-bold-duotone',
    id: 'special',
    label: 'Special Motifs',
    presets: [
      { icon: 'i-solar:flower-bold-duotone', id: 'lotus', label: 'Argent Lotus', text: 'The Argent Lotus motif. Translucent white silk petal layers over heavy silver brocade, with delicate silver filigree lotus accents.' },
    ],
  },
]
