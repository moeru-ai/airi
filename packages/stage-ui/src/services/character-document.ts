import type { CharacterDocument } from '@proj-airi/server-sdk-shared/contacts'

import type { AiriCard } from '../types/airiCard'

import { CharacterDocumentSchema } from '@proj-airi/server-sdk-shared/contacts'
import { parse } from 'valibot'

/** Builds an allowlisted cloud document without resolving inherited settings or copying local credentials. */
export function toCharacterDocument(card: AiriCard): CharacterDocument {
  const modules = card.extensions.airi.modules
  const speech = modules.speech
  const artistry = modules.artistry
  const document = {
    name: card.name,
    version: card.version,
    creator: card.creator,
    nickname: card.nickname,
    description: card.description,
    personality: card.personality,
    scenario: card.scenario,
    systemPrompt: card.systemPrompt,
    postHistoryInstructions: card.postHistoryInstructions,
    notes: card.notes,
    tags: card.tags,
    greetings: card.greetings,
    extensions: {
      airi: {
        modules: {
          consciousness: { provider: modules.consciousness.provider, model: modules.consciousness.model },
          vision: { provider: modules.vision.provider, model: modules.vision.model },
          speech: {
            provider: speech.provider,
            model: speech.model,
            voice_id: speech.voice_id,
            pitch: speech.pitch,
            rate: speech.rate,
            ssml: speech.ssml,
            language: speech.language,
          },
          displayModelId: modules.displayModelId,
          artistry: artistry && {
            enabled: artistry.enabled,
            provider: artistry.provider,
            model: artistry.model,
            promptPrefix: artistry.promptPrefix,
            widgetInstruction: artistry.widgetInstruction,
            spawnMode: artistry.spawnMode,
            autonomousEnabled: artistry.autonomousEnabled,
            autonomousThreshold: artistry.autonomousThreshold,
            autonomousTarget: artistry.autonomousTarget,
          },
        },
        agents: Object.fromEntries(Object.entries(card.extensions.airi.agents).map(([key, agent]) => [key, { prompt: agent.prompt, enabled: agent.enabled }])),
      },
    },
  }
  return parse(CharacterDocumentSchema, JSON.parse(JSON.stringify(document)))
}

/** Applies a cloud document while retaining device-only assets, provider options, and unsupported card metadata. */
export function applyCharacterDocument(document: CharacterDocument, local?: AiriCard): AiriCard {
  const base: Partial<AiriCard> = { ...local }
  for (const field of ['creator', 'nickname', 'description', 'personality', 'scenario', 'systemPrompt', 'postHistoryInstructions', 'notes', 'tags', 'greetings'] as const)
    delete base[field]
  const modules: AiriCard['extensions']['airi']['modules'] = { ...local?.extensions.airi.modules, ...document.extensions.airi.modules }
  modules.displayModelId = document.extensions.airi.modules.displayModelId
  const localArtistry = local?.extensions.airi.modules.artistry
  const remoteArtistry = document.extensions.airi.modules.artistry
  modules.artistry = localArtistry
    ? { ...remoteArtistry, options: localArtistry.options, workflowId: localArtistry.workflowId }
    : remoteArtistry
  return {
    ...base,
    ...document,
    extensions: {
      ...local?.extensions,
      airi: { modules, agents: document.extensions.airi.agents },
    },
  }
}
