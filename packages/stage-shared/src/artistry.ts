import { defineInvokeEventa } from '@moeru/eventa'

export interface ArtistrySyncPayload {
  provider: string
  globals: any
  // Card-level defaults to ensure widget triggers respect character settings
  model?: string
  promptPrefix?: string
  options?: Record<string, any>
}
export const ARTISTRY_SYNC_CONFIG_ADDRESS = 'eventa:invoke:electron:artistry:sync-config'
export const ARTISTRY_TEST_COMFYUI_CONNECTION_ADDRESS = 'eventa:invoke:electron:artistry:test-comfyui-connection'

export const artistrySyncConfig = defineInvokeEventa<void, ArtistrySyncPayload>(ARTISTRY_SYNC_CONFIG_ADDRESS)

export interface ArtistryTestComfyUIResult {
  ok: boolean
  info?: string
  isCors?: boolean
}
export const artistryTestComfyUIConnection = defineInvokeEventa<ArtistryTestComfyUIResult, { url: string }>(ARTISTRY_TEST_COMFYUI_CONNECTION_ADDRESS)

export const artistryGenerateHeadless = defineInvokeEventa<{ imageUrl?: string, base64?: string, error?: string }, { prompt: string, model?: string, provider?: string, options?: Record<string, any>, globals?: Record<string, any> }>('eventa:invoke:electron:artistry:generate-headless')

export const REPLICATE_IMAGEGEN_PRESETS = [
  {
    id: 'prunaai/p-image',
    label: 'p-image',
    cost: '$1 / 200 imgs',
    prompt: 'A high-quality anime-style illustration with professional shading, vibrant colors, hand-drawn aesthetic, highly detailed,',
    preset: {
      aspect_ratio: '16:9',
    },
  },
  {
    id: 'prunaai/z-image-turbo',
    label: 'z-turbo',
    cost: '$1 / 200 imgs',
    prompt: 'A highly detailed anime illustration, crisp lines, vibrant color palette, professional digital art style, nicely shaded,',
    preset: {
      width: 1024,
      height: 768,
      output_format: 'jpg',
      guidance_scale: 0,
      output_quality: 80,
      num_inference_steps: 8,
    },
  },
  {
    id: 'black-forest-labs/flux-schnell',
    label: 'flux-schnell',
    cost: '$1 / 333 imgs',
    prompt: 'A stunning, high-definition anime scene, professional cel-shading, vibrant atmosphere, hand-drawn quality,',
    preset: {
      go_fast: true,
      num_outputs: 1,
      aspect_ratio: '1:1',
      output_format: 'webp',
      output_quality: 80,
    },
  },
  {
    id: 'prunaai/z-image-turbo-lora:197b2db2015aa366d2bc61a941758adf4c31ac66b18573f5c66dc388ab081ca2',
    label: 'z-turbo-lora',
    cost: '$1 / 217 imgs',
    prompt: 'A beautifully rendered anime illustration in a classic hand-drawn style, rich textures, vibrant colors, masterpiece quality,',
    preset: {
      width: 1024,
      height: 1024,
      lora_scales: [1],
      lora_weights: ['https://huggingface.co/renderartist/Technically-Color-Z-Image-Turbo/resolve/main/Technically_Color_Z_Image_Turbo_v1_renderartist_2000.safetensors'],
      output_format: 'jpg',
      guidance_scale: 0,
      output_quality: 80,
      num_inference_steps: 8,
    },
  },
  {
    id: 'aisha-ai-official/wai-nsfw-illustrious-v11:c1d5b02687df6081c7953c74bcc527858702e8c153c9382012ccc3906752d3ec',
    label: 'wai-ilx',
    cost: '$1 / 151 imgs',
    prompt: 'high quality, masterpiece, hirez, absurdres, anime style, highly detailed, vibrant colors, aesthetic,',
    preset: {
      vae: 'default',
      seed: -1,
      model: 'WAI-NSFW-illustrious-SDXL-v11',
      steps: 30,
      width: 1024,
      height: 1024,
      cfg_scale: 7,
      clip_skip: 2,
      pag_scale: 3,
      scheduler: 'Euler a',
      batch_size: 1,
      negative_prompt: 'nsfw, naked',
      guidance_rescale: 0.5,
      prepend_preprompt: true,
    },
  },
  {
    id: 'aisha-ai-official/anillustrious-v4:80441e2c32a55f2fcf9b77fa0a74c6c86ad7deac51eed722b9faedb253265cb4',
    label: 'anillustrious',
    cost: '$1 / 188 imgs',
    prompt: 'high quality, masterpiece, hirez, absurdres, anime style, detailed background, atmospheric, beautifully shaded,',
    preset: {
      vae: 'default',
      seed: -1,
      model: 'Anillustrious-v4',
      steps: 30,
      width: 1024,
      height: 1024,
      refiner: false,
      upscale: 'Original',
      cfg_scale: 7,
      clip_skip: 2,
      pag_scale: 0,
      scheduler: 'Euler a beta',
      adetailer_face: false,
      adetailer_hand: false,
      refiner_prompt: '',
      negative_prompt: 'nsfw, naked',
      adetailer_person: false,
      guidance_rescale: 1,
      refiner_strength: 0.8,
      prepend_preprompt: true,
      prompt_conjunction: true,
      adetailer_face_prompt: '',
      adetailer_hand_prompt: '',
      adetailer_person_prompt: '',
      negative_prompt_conjunction: false,
      adetailer_face_negative_prompt: '',
      adetailer_hand_negative_prompt: '',
      adetailer_person_negative_prompt: '',
    },
  },
]

export const REPLICATE_IMAGEEDIT_PRESETS = [
  {
    id: 'prunaai/p-image-edit',
    label: 'P-Image-Edit (Texture Swapper)',
    cost: 'Turbo',
    prompt: 'The woman\'s dress is changed to black',
    preset: {
      turbo: true,
      images: [{ value: '{{IMAGE}}' }],
      aspect_ratio: '1:1',
    },
  },
]
export const ARTISTRY_PRESET_GROUPS = [
  {
    id: 'fabrics',
    label: 'Fabric Lab',
    icon: 'i-solar:palette-bold-duotone',
    presets: [
      { id: 'gold', label: 'Gold Leaf', icon: 'i-solar:star-bold-duotone', text: 'Divine Golden transformation. Pure white velvet fabric with thick 24k gold leaf embroidery and glowing white celestial patterns.' },
      { id: 'gothic', label: 'Midnight Gothic', icon: 'i-solar:ghost-bold-duotone', text: 'Midnight Gothic style. Deep matte black fabric, crimson lace ruffles, dark leather straps, silver scrollwork embroidery.' },
      { id: 'royal', label: 'Royal Porcelain', icon: 'i-solar:crown-minimalistic-bold-duotone', text: 'Royal Porcelain style. White silk base, hand-painted cobalt blue patterns, golden silk sashes, jade ornaments.' },
      { id: 'denim', label: 'Raw Indigo Denim', icon: 'i-solar:t-shirt-bold-duotone', text: 'Heavyweight dark indigo denim with thick orange contrast stitching and realistic weathered fading.' },
      { id: 'plaid', label: 'Classic Tartan Plaid', icon: 'i-solar:widget-bold-duotone', text: 'Traditional red and green Scottish wool plaid with a visible woven texture and cozy feel.' },
      { id: 'satin', label: 'Powder Blue Satin', icon: 'i-solar:water-drops-bold-duotone', text: 'Highly reflective, pale baby blue silk with smooth flowing "liquid" highlights and high luster.' },
      { id: 'hex', label: 'Tactical Hex-Grid', icon: 'i-solar:shield-bold-duotone', text: 'Matte olive drab fabric with a subtle hexagonal heat-pressed grid pattern and dark grey utility straps.' },
      { id: 'camo', label: 'Cyber Pink Camo', icon: 'i-solar:skateboarding-bold-duotone', text: 'Vibrant hot pink and charcoal grey urban camouflage with a slight tech-fabric sheen.' },
    ],
  },
  {
    id: 'hair',
    label: 'Hair Salon',
    icon: 'i-solar:scissors-bold-duotone',
    presets: [
      { id: 'silver', label: 'Iridescent Silver', icon: 'i-solar:snowflake-bold-duotone', text: 'Pure white hair with subtle prismatic "oil-slick" highlights that catch the light.' },
      { id: 'onyx', label: 'Onyx Gloss', icon: 'i-solar:moon-bold-duotone', text: 'Pitch black hair with a high-mirror shine and sharp, high-contrast highlights.' },
      { id: 'sunset', label: 'Sunset Ombre', icon: 'i-solar:sun-2-bold-duotone', text: 'Vibrant gradient from deep copper roots to fiery orange and golden blonde tips.' },
      { id: 'mint', label: 'Ghost Mint', icon: 'i-solar:leaf-bold-duotone', text: 'Soft, matte pastel mint green with a "cloud-like" ethereal texture.' },
      { id: 'pink', label: 'Bubblegum Pop', icon: 'i-solar:heart-bold-duotone', text: 'High-gloss, vibrant candy pink with a plastic-like shine and white "rim" highlights.' },
      { id: 'rainbow', label: 'Retrowave Rainbow', icon: 'i-solar:filters-bold-duotone', text: 'Multi-colored "raver girl" hair; dark roots with glowing neon streaks of cyan, magenta, and lime green.' },
    ],
  },
  {
    id: 'eyes',
    label: 'Iris Forge',
    icon: 'i-solar:eye-bold-duotone',
    presets: [
      { id: 'dragon', label: 'Dragon Slit', icon: 'i-solar:fire-bold-duotone', text: 'Glowing orange irises with vertical black slit pupils and a subtle reptilian texture.' },
      { id: 'heart', label: 'Succubus Heart', icon: 'i-solar:heart-angle-bold-duotone', text: 'Soft pink irises with glowing white heart-shaped pupils and a "love-struck" aura.' },
      { id: 'star', label: 'Celestial Star', icon: 'i-solar:star-fall-bold-duotone', text: 'Deep violet eyes with white star-shaped pupils and a subtle ring of stardust.' },
      { id: 'galaxy', label: 'Nebula Galaxy', icon: 'i-solar:atom-bold-duotone', text: 'Deep space irises containing tiny sparkling stars and purple nebula clusters.' },
      { id: 'cyber-eye', label: 'Cyber Scan', icon: 'i-solar:scanner-2-bold-duotone', text: 'Glowing cyan HUD-style eyes with digital scanning rings and data-stream pupils.' },
    ],
  },
  {
    id: 'special',
    label: 'Special Motifs',
    icon: 'i-solar:magic-stick-bold-duotone',
    presets: [
      { id: 'lotus', label: 'Argent Lotus', icon: 'i-solar:flower-bold-duotone', text: 'The Argent Lotus motif. Translucent white silk petal layers over heavy silver brocade, with delicate silver filigree lotus accents.' },
    ],
  },
]
