import type { Env } from '../libs/env'
import type { ImageJob } from '../schemas/nsfw-media'

interface PlannerParams {
  style?: string
  mood?: string
  framing?: string
  aspectRatio?: string
}

type ComfyPromptWorkflow = Record<string, {
  class_type: string
  inputs: Record<string, unknown>
}>

function parsePlannerParams(params: Record<string, unknown>): PlannerParams {
  const planner = params.planner
  if (!planner || typeof planner !== 'object' || Array.isArray(planner)) {
    return {}
  }

  const record = planner as Record<string, unknown>
  return {
    style: typeof record.style === 'string' ? record.style : undefined,
    mood: typeof record.mood === 'string' ? record.mood : undefined,
    framing: typeof record.framing === 'string' ? record.framing : undefined,
    aspectRatio: typeof record.aspectRatio === 'string' ? record.aspectRatio : undefined,
  }
}

function dimensionsFromAspectRatio(aspectRatio?: string) {
  switch ((aspectRatio ?? '').trim()) {
    case '3:4':
      return { width: 768, height: 1024 }
    case '4:3':
      return { width: 1024, height: 768 }
    case '16:9':
      return { width: 1216, height: 704 }
    case '9:16':
      return { width: 704, height: 1216 }
    case '1:1':
      return { width: 1024, height: 1024 }
    default:
      return { width: 768, height: 1024 }
  }
}

function clampDimensions(width: number, height: number, maxDimension: number) {
  const largestDimension = Math.max(width, height)
  if (largestDimension <= maxDimension) {
    return { width, height }
  }

  const scale = maxDimension / largestDimension
  const clamp = (value: number) => {
    const scaled = Math.max(64, Math.round((value * scale) / 64) * 64)
    return scaled
  }

  return {
    width: clamp(width),
    height: clamp(height),
  }
}

function workflowPrefix(job: ImageJob, planner: PlannerParams) {
  return ['airi', job.route, job.characterId, planner.mood ?? 'scene']
    .map(part => String(part).trim().replace(/[^\w-]+/g, '-'))
    .filter(Boolean)
    .join('-')
}

export function buildDefaultComfyWorkflow(job: ImageJob, env: Env): ComfyPromptWorkflow {
  const planner = parsePlannerParams(job.params)
  const baseDimensions = dimensionsFromAspectRatio(planner.aspectRatio)
  const { width, height } = clampDimensions(baseDimensions.width, baseDimensions.height, env.COMFYUI_MAX_DIMENSION)
  const positiveText = [
    job.prompt,
    planner.style,
    planner.mood,
    planner.framing,
  ].filter(Boolean).join(', ')

  const seedSource = Number.parseInt(job.id.replace(/\D/g, '').slice(0, 9), 10)
  const seed = Number.isFinite(seedSource) ? seedSource : Date.now() % 2147483647

  const primaryLoraEnabled = Boolean(env.COMFYUI_DEFAULT_LORA?.trim())
  const secondaryLoraEnabled = Boolean(env.COMFYUI_SECONDARY_LORA?.trim())

  const modelSource: [string, number] = secondaryLoraEnabled
    ? ['11', 0]
    : primaryLoraEnabled
      ? ['10', 0]
      : ['4', 0]

  const clipSource: [string, number] = secondaryLoraEnabled
    ? ['11', 1]
    : primaryLoraEnabled
      ? ['10', 1]
      : ['4', 1]
  const workflow: ComfyPromptWorkflow = {
    3: {
      class_type: 'KSampler',
      inputs: {
        cfg: env.COMFYUI_DEFAULT_CFG,
        denoise: 1,
        latent_image: ['5', 0],
        model: modelSource,
        negative: ['7', 0],
        positive: ['6', 0],
        sampler_name: 'euler',
        scheduler: 'normal',
        seed,
        steps: env.COMFYUI_DEFAULT_STEPS,
      },
    },
    4: {
      class_type: 'CheckpointLoaderSimple',
      inputs: {
        ckpt_name: env.COMFYUI_DEFAULT_CHECKPOINT,
      },
    },
    5: {
      class_type: 'EmptyLatentImage',
      inputs: {
        batch_size: 1,
        height,
        width,
      },
    },
    6: {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: clipSource,
        text: positiveText,
      },
    },
    7: {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: clipSource,
        text: job.negativePrompt,
      },
    },
    8: {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['3', 0],
        vae: ['4', 2],
      },
    },
    9: {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: workflowPrefix(job, planner),
        images: ['8', 0],
      },
    },
  }

  if (primaryLoraEnabled) {
    workflow['10'] = {
      class_type: 'LoraLoader',
      inputs: {
        model: ['4', 0],
        clip: ['4', 1],
        lora_name: env.COMFYUI_DEFAULT_LORA,
        strength_model: env.COMFYUI_DEFAULT_LORA_STRENGTH_MODEL,
        strength_clip: env.COMFYUI_DEFAULT_LORA_STRENGTH_CLIP,
      },
    }
  }

  if (secondaryLoraEnabled) {
    workflow['11'] = {
      class_type: 'LoraLoader',
      inputs: {
        model: primaryLoraEnabled ? ['10', 0] : ['4', 0],
        clip: primaryLoraEnabled ? ['10', 1] : ['4', 1],
        lora_name: env.COMFYUI_SECONDARY_LORA,
        strength_model: env.COMFYUI_SECONDARY_LORA_STRENGTH_MODEL,
        strength_clip: env.COMFYUI_SECONDARY_LORA_STRENGTH_CLIP,
      },
    }
  }

  return workflow
}
