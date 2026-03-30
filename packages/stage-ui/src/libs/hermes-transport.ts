import type {
  HermesImagePromptRequest,
  HermesImagePromptResponse,
  HermesReplyRequest,
  HermesReplyResponse,
} from '@proj-airi/server-sdk-shared'

import { HERMES_URL } from './server'

export type HermesReplyTransport = (request: HermesReplyRequest) => Promise<HermesReplyResponse>
export type HermesImagePromptTransport = (request: HermesImagePromptRequest) => Promise<HermesImagePromptResponse>

export function createStubHermesReply(request: HermesReplyRequest): HermesReplyResponse {
  const userMessage = request.message.content.trim()
  const personality = request.character.personaProfile.personality?.trim()
  const prefix = personality ? `${personality}. ` : ''

  if (request.route === 'nsfw' && (!request.user.adultVerified || !request.user.allowSensitiveContent || request.user.contentTier === 'standard')) {
    return {
      requestId: request.requestId,
      route: request.route,
      reply: {
        role: 'assistant',
        content: 'NSFW access is blocked for this account.',
      },
      runtime: {
        replyModel: 'Hermes-4.3-36B',
        routerModel: 'grok-4.20',
        memoryModel: 'gpt-5-mini',
      },
      memoryUpdates: {
        factsAdd: [],
        factsRemove: [],
      },
      judge: {
        score: null,
        flags: ['nsfw_access_denied'],
      },
      sceneType: 'nsfw',
    }
  }

  return {
    requestId: request.requestId,
    route: request.route,
    reply: {
      role: 'assistant',
      content: `${prefix}${userMessage ? `You said: ${userMessage}` : 'Ready.'}`,
    },
    runtime: {
      replyModel: 'Hermes-4.3-36B',
      routerModel: 'grok-4.20',
      memoryModel: 'gpt-5-mini',
    },
    memoryUpdates: {
      summaryAppend: userMessage ? `User said: ${userMessage}` : undefined,
      factsAdd: [],
      factsRemove: [],
    },
    judge: {
      score: null,
      flags: [],
    },
    sceneType: request.route === 'nsfw' ? 'nsfw' : request.character.relationshipMode,
  }
}

export async function generateHermesReplyViaTransport(
  request: HermesReplyRequest,
  transport?: HermesReplyTransport,
): Promise<HermesReplyResponse> {
  if (!transport)
    return createStubHermesReply(request)

  return await transport(request)
}

export function createHttpHermesTransport(baseUrl: string = HERMES_URL): HermesReplyTransport {
  return async (request) => {
    const response = await fetch(new URL('/v1/airi/generate-reply', baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error(`Hermes transport failed with status ${response.status}`)
    }

    return await response.json() as HermesReplyResponse
  }
}

export async function generateHermesImagePromptViaTransport(
  request: HermesImagePromptRequest,
  transport?: HermesImagePromptTransport,
): Promise<HermesImagePromptResponse> {
  if (!transport) {
    return {
      requestId: request.requestId,
      route: request.route,
      prompt: request.prompt,
      negativePrompt: '',
      tags: [],
      sceneType: request.route === 'nsfw' ? 'nsfw' : request.character.relationshipMode,
    }
  }

  return await transport(request)
}

export function createHttpHermesImagePromptTransport(baseUrl: string = HERMES_URL): HermesImagePromptTransport {
  return async (request) => {
    const response = await fetch(new URL('/v1/airi/generate-image-prompt', baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error(`Hermes image prompt transport failed with status ${response.status}`)
    }

    return await response.json() as HermesImagePromptResponse
  }
}
