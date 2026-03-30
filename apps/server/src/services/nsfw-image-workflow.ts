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

function workflowPrefix(job: ImageJob, planner: PlannerParams) {
  return ['airi', job.route, job.characterId, planner.mood ?? 'scene']
    .map(part => String(part).trim().replace(/[^a-zA-Z0-9_-]+/g, '-'))
    .filter(Boolean)
    .join('-')
}

export function buildDefaultComfyWorkflow(job: ImageJob, env: Env): ComfyPromptWorkflow {
  const planner = parsePlannerParams(job.params)
  const { width, height } = dimensionsFromAspectRatio(planner.aspectRatio)
  const positiveText = [
    job.prompt,
    planner.style,
    planner.mood,
    planner.framing,
  ].filter(Boolean).join(', ')

  const seedSource = Number.parseInt(job.id.replace(/\D/g, '').slice(0, 9), 10)
  const seed = Number.isFinite(seedSource) ? seedSource : Date.now() % 2147483647

  return {
    '3': {
      class_type: 'KSampler',
      inputs: {
        cfg: 8,
        denoise: 1,
        latent_image: ['5', 0],
        model: ['4', 0],
        negative: ['7', 0],
        positive: ['6', 0],
        sampler_name: 'euler',
        scheduler: 'normal',
        seed,
        steps: 24,
      },
    },
    '4': {
      class_type: 'CheckpointLoaderSimple',
      inputs: {
        ckpt_name: env.COMFYUI_DEFAULT_CHECKPOINT,
      },
    },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: {
        batch_size: 1,
        height,
        width,
      },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['4', 1],
        text: positiveText,
      },
    },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: {
        clip: ['4', 1],
        text: job.negativePrompt,
      },
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['3', 0],
        vae: ['4', 2],
      },
    },
    '9': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: workflowPrefix(job, planner),
        images: ['8', 0],
      },
    },
  }
}
