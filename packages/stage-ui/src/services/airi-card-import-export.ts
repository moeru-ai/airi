import type { Card, ccv3 } from '@proj-airi/ccc'
import type { GenericSchema, InferOutput } from 'valibot'

import type { DisplayModel, useDisplayModelsStore } from '../stores/display-models'
import type { AiriCard, AiriExtension } from '../types/airiCard'

import JSZip from 'jszip'

import { exportToJSON } from '@proj-airi/ccc'
import { array, literal, object, optional, parse, picklist, record, string, unknown as unknownSchema } from 'valibot'

import { DisplayModelFormat } from '../stores/display-models'

const FORMAT = 'airi-character-card'
const VERSION = 1
const CARD_PATH = 'card.json'
const MANIFEST_PATH = 'manifest.json'
const MODEL_EXT: Partial<Record<DisplayModelFormat, string>> = {
  [DisplayModelFormat.Live2dZip]: 'zip',
  [DisplayModelFormat.SpineZip]: 'zip',
  [DisplayModelFormat.TachieZip]: 'tachie.zip',
  [DisplayModelFormat.VRM]: 'vrm',
}

type DisplayModelsStore = ReturnType<typeof useDisplayModelsStore>
type ShareableAiriCard = Card & { extensions: { airi: AiriExtension } }

const manifestSchema = object({
  card: object({ path: literal(CARD_PATH), spec: literal('chara_card_v3') }),
  format: literal(FORMAT),
  resources: optional(object({
    displayModel: object({
      format: picklist([DisplayModelFormat.Live2dZip, DisplayModelFormat.SpineZip, DisplayModelFormat.TachieZip, DisplayModelFormat.VRM]),
      name: string(),
      path: string(),
    }),
  })),
  version: literal(VERSION),
})

const characterCardV3Schema = object({
  data: object({
    alternate_greetings: optional(array(string()), []),
    character_version: optional(string(), '1.0.0'),
    creator_notes: optional(string(), ''),
    description: optional(string(), ''),
    extensions: optional(record(string(), unknownSchema()), {}),
    first_mes: optional(string(), ''),
    name: string(),
    nickname: optional(string()),
    personality: optional(string(), ''),
    post_history_instructions: optional(string(), ''),
    scenario: optional(string(), ''),
    system_prompt: optional(string(), ''),
  }),
  spec: literal('chara_card_v3'),
  spec_version: literal('3.0'),
})

type AiriCardPackageErrorCode = 'invalid-file' | 'missing-file'

type CharacterCardPackageJson = InferOutput<typeof characterCardV3Schema>
type Manifest = InferOutput<typeof manifestSchema>

export class AiriCardPackageError extends Error {
  constructor(public readonly code: AiriCardPackageErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AiriCardPackageError'
  }
}

/**
 * Creates a portable AIRI Card share package.
 *
 * This format is intentionally not a lossless backup. It includes fields the
 * creation editor lets the sender review, a sanitized AIRI module subset, and
 * the selected display model. Unreviewed CCv3 metadata, custom extensions,
 * agent prompts, and machine-local runtime references are omitted.
 */
export async function exportAiriCardPackage({ card, displayModelsStore }: { card: AiriCard, displayModelsStore: DisplayModelsStore }): Promise<Blob> {
  const exportableCard = cardFromAiriCard(card)
  const displayModel = await exportDisplayModel(exportableCard, displayModelsStore)
  const manifest = {
    card: { path: CARD_PATH, spec: 'chara_card_v3' },
    createdAt: new Date().toISOString(),
    format: FORMAT,
    version: VERSION,
    ...(displayModel ? { resources: { displayModel: displayModel.manifest } } : {}),
  }
  const zip = new JSZip()

  zip.file(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
  zip.file(CARD_PATH, JSON.stringify(exportToJSON(exportableCard), null, 2))
  if (displayModel)
    zip.file(displayModel.manifest.path, displayModel.data)

  return zip.generateAsync({ type: 'blob' })
}

/**
 * Imports a portable package through the same share-field whitelist.
 *
 * The returned CCv3 object is safe to pass through the normal card creation
 * path: package authors cannot smuggle custom extensions, agent prompts, or
 * machine-local references into persisted AIRI state.
 */
export async function importAiriCardPackage({ displayModelsStore, file }: { displayModelsStore: DisplayModelsStore, file: File }): Promise<ccv3.CharacterCardV3> {
  const zip = await loadZip(file)
  const manifest = await readJsonFile(zip, MANIFEST_PATH, manifestSchema)
  const cardJson = await readJsonFile(zip, manifest.card.path, characterCardV3Schema)
  const displayModelId = await importDisplayModel(zip, manifest, displayModelsStore)

  return exportToJSON(cardFromCharacterCard(cardJson, displayModelId))
}

function cardFromAiriCard(card: AiriCard): ShareableAiriCard {
  return {
    description: card.description ?? '',
    extensions: { airi: sanitizeAiri(card.extensions?.airi) },
    greetings: card.greetings ?? [],
    name: card.name,
    nickname: card.nickname,
    notes: card.notes ?? '',
    personality: card.personality ?? '',
    postHistoryInstructions: card.postHistoryInstructions ?? '',
    scenario: card.scenario ?? '',
    systemPrompt: card.systemPrompt ?? '',
    version: card.version,
  }
}

function cardFromCharacterCard(card: CharacterCardPackageJson, displayModelId?: string): ShareableAiriCard {
  const data = card.data
  return {
    description: data.description,
    extensions: { airi: sanitizeAiri(data.extensions?.airi, displayModelId) },
    greetings: [data.first_mes, ...(data.alternate_greetings ?? [])],
    name: data.name,
    nickname: data.nickname,
    notes: data.creator_notes,
    personality: data.personality,
    postHistoryInstructions: data.post_history_instructions,
    scenario: data.scenario,
    systemPrompt: data.system_prompt,
    version: data.character_version,
  }
}

async function displayModelPayload(model: DisplayModel): Promise<{ data: ArrayBuffer, file: File }> {
  try {
    const response = model.type === 'url' ? await fetch(model.url) : undefined
    if (response && !response.ok)
      throw new Error(`Failed to read display model URL: ${response.status} ${response.statusText}`)

    const file = model.type === 'file' ? model.file : new File([await response!.blob()], `${model.name}.${MODEL_EXT[model.format]}`)
    if (file.size <= 0)
      throw new Error('Display model file is empty')
    return { data: await file.arrayBuffer(), file }
  }
  catch (cause) {
    throw error('invalid-file', 'Failed to read display model file', { cause })
  }
}

function error(code: AiriCardPackageErrorCode, message: string, options?: { cause?: unknown }) {
  return new AiriCardPackageError(code, message, options)
}

async function exportDisplayModel(card: ShareableAiriCard, store: DisplayModelsStore) {
  const displayModelId = card.extensions.airi.modules.displayModelId
  if (!displayModelId)
    return

  const model = await store.getDisplayModel(displayModelId)
  if (!model) {
    if (displayModelId.startsWith('display-model-'))
      throw error('invalid-file', 'Missing local display model')
    return
  }

  const modelExt = MODEL_EXT[model.format]
  if (!modelExt)
    throw error('invalid-file', 'Unsupported or empty local display model')

  const payload = await displayModelPayload(model)

  return {
    data: payload.data,
    manifest: {
      format: model.format,
      name: payload.file.name,
      path: `models/body-model.${modelExt}`,
    },
  }
}

async function importDisplayModel(zip: JSZip, manifest: Manifest, store: DisplayModelsStore) {
  const resource = manifest.resources?.displayModel
  if (!resource)
    return

  const file = zip.file(resource.path)
  if (!file)
    throw error('missing-file', 'Missing display model file')

  try {
    const data = await file.async('arraybuffer')
    return (await store.addDisplayModel(resource.format, new File([data], resource.name))).id
  }
  catch (cause) {
    throw error('invalid-file', 'Failed to import display model file', { cause })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSpawnMode(value: unknown): value is NonNullable<AiriExtension['modules']['artistry']>['spawnMode'] {
  return value === 'bg' || value === 'widget' || value === 'inline' || value === 'bg_widget'
}

async function loadZip(file: File) {
  try {
    return await JSZip.loadAsync(await file.arrayBuffer())
  }
  catch (cause) {
    throw error('invalid-file', 'Invalid zip file', { cause })
  }
}

function providerModel(value: unknown) {
  const source = isRecord(value) ? value : {}
  return { model: stringValue(source.model), provider: stringValue(source.provider) }
}

async function readJsonFile<S extends GenericSchema>(zip: JSZip, path: string, schema: S): Promise<InferOutput<S>> {
  const file = zip.file(path)
  if (!file)
    throw error('missing-file', `Missing ${path}`)

  try {
    return parse(schema, JSON.parse(await file.async('string')))
  }
  catch (cause) {
    throw error('invalid-file', `Invalid ${path}`, { cause })
  }
}

function sanitizeAiri(value: unknown, displayModelIdOverride?: string): AiriExtension {
  const source = isRecord(value) ? value : {}
  const modules = isRecord(source.modules) ? source.modules : {}
  const artistry = isRecord(modules.artistry) ? modules.artistry : {}
  const speech = isRecord(modules.speech) ? modules.speech : {}
  const displayModelId = displayModelIdOverride ?? stringValue(modules.displayModelId)

  return {
    agents: {},
    modules: {
      consciousness: providerModel(modules.consciousness),
      speech: {
        ...providerModel(modules.speech),
        voice_id: stringValue(speech.voice_id),
      },
      vision: providerModel(modules.vision),
      ...(displayModelId ? { displayModelId } : {}),
      artistry: {
        ...(typeof artistry.provider === 'string' ? { provider: artistry.provider } : {}),
        ...(typeof artistry.model === 'string' ? { model: artistry.model } : {}),
        ...(typeof artistry.promptPrefix === 'string' ? { promptPrefix: artistry.promptPrefix } : {}),
        ...(typeof artistry.widgetInstruction === 'string' ? { widgetInstruction: artistry.widgetInstruction } : {}),
        ...(isSpawnMode(artistry.spawnMode) ? { spawnMode: artistry.spawnMode } : {}),
        ...(isRecord(artistry.options) ? { options: artistry.options } : {}),
        ...(typeof artistry.autonomousEnabled === 'boolean' ? { autonomousEnabled: artistry.autonomousEnabled } : {}),
        ...(typeof artistry.autonomousThreshold === 'number' ? { autonomousThreshold: artistry.autonomousThreshold } : {}),
      },
    },
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}
