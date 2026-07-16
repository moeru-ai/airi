import type { Card, ccv3 } from '@proj-airi/ccc'
import type { GenericSchema, InferOutput } from 'valibot'

import type { DisplayModel, useDisplayModelsStore } from '../stores/display-models'
import type { AiriCard, AiriExtension } from '../stores/modules/airi-card'

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
  [DisplayModelFormat.VRM]: 'vrm',
}

type DisplayModelsStore = ReturnType<typeof useDisplayModelsStore>
type ExportableCard = Card & { extensions: { airi: AiriExtension } }

const manifestSchema = object({
  format: literal(FORMAT),
  version: literal(VERSION),
  card: object({ path: literal(CARD_PATH), spec: literal('chara_card_v3') }),
  resources: optional(object({
    displayModel: object({
      path: string(),
      format: picklist([DisplayModelFormat.Live2dZip, DisplayModelFormat.SpineZip, DisplayModelFormat.VRM]),
      name: string(),
    }),
  })),
})

const characterCardV3Schema = object({
  spec: literal('chara_card_v3'),
  spec_version: literal('3.0'),
  data: object({
    name: string(),
    nickname: optional(string()),
    character_version: optional(string(), '1.0.0'),
    description: optional(string(), ''),
    personality: optional(string(), ''),
    scenario: optional(string(), ''),
    first_mes: optional(string(), ''),
    alternate_greetings: optional(array(string()), []),
    creator_notes: optional(string(), ''),
    system_prompt: optional(string(), ''),
    post_history_instructions: optional(string(), ''),
    extensions: optional(record(string(), unknownSchema()), {}),
  }),
})

type CharacterCardPackageJson = InferOutput<typeof characterCardV3Schema>

type AiriCardPackageErrorCode = 'missing-file' | 'invalid-file'
type Manifest = InferOutput<typeof manifestSchema>

export class AiriCardPackageError extends Error {
  constructor(public readonly code: AiriCardPackageErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AiriCardPackageError'
  }
}

/** Exports only the creation/edit form whitelist; provider globals and runtime state are never cloned. */
export async function exportAiriCardPackage({ card, displayModelsStore }: { card: AiriCard, displayModelsStore: DisplayModelsStore }): Promise<Blob> {
  const exportableCard = cardFromAiriCard(card)
  const displayModel = await exportDisplayModel(exportableCard, displayModelsStore)
  const manifest = {
    format: FORMAT,
    version: VERSION,
    createdAt: new Date().toISOString(),
    card: { path: CARD_PATH, spec: 'chara_card_v3' },
    ...(displayModel ? { resources: { displayModel: displayModel.manifest } } : {}),
  }
  const zip = new JSZip()

  zip.file(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
  zip.file(CARD_PATH, JSON.stringify(exportToJSON(exportableCard), null, 2))
  if (displayModel)
    zip.file(displayModel.manifest.path, displayModel.data)

  return zip.generateAsync({ type: 'blob' })
}

/** Imports a package as sanitized CCv3 JSON; edited zip payloads cannot smuggle extra AIRI fields through. */
export async function importAiriCardPackage({ file, displayModelsStore }: { file: File, displayModelsStore: DisplayModelsStore }): Promise<ccv3.CharacterCardV3> {
  const zip = await loadZip(file)
  const manifest = await readJsonFile(zip, MANIFEST_PATH, manifestSchema)
  const cardJson = await readJsonFile(zip, manifest.card.path, characterCardV3Schema)
  const displayModelId = await importDisplayModel(zip, manifest, displayModelsStore)

  return exportToJSON(cardFromCharacterCard(cardJson, displayModelId))
}

async function exportDisplayModel(card: ExportableCard, store: DisplayModelsStore) {
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

async function loadZip(file: File) {
  try {
    return await JSZip.loadAsync(await file.arrayBuffer())
  }
  catch (cause) {
    throw error('invalid-file', 'Invalid zip file', { cause })
  }
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

function cardFromAiriCard(card: AiriCard): ExportableCard {
  return {
    name: card.name,
    nickname: card.nickname,
    version: card.version,
    description: card.description ?? '',
    personality: card.personality ?? '',
    scenario: card.scenario ?? '',
    greetings: card.greetings ?? [],
    notes: card.notes ?? '',
    systemPrompt: card.systemPrompt ?? '',
    postHistoryInstructions: card.postHistoryInstructions ?? '',
    extensions: { airi: sanitizeAiri(card.extensions?.airi) },
  }
}

function cardFromCharacterCard(card: CharacterCardPackageJson, displayModelId?: string): ExportableCard {
  const data = card.data
  return {
    name: data.name,
    nickname: data.nickname,
    version: data.character_version,
    description: data.description,
    personality: data.personality,
    scenario: data.scenario,
    greetings: [data.first_mes, ...(data.alternate_greetings ?? [])],
    notes: data.creator_notes,
    systemPrompt: data.system_prompt,
    postHistoryInstructions: data.post_history_instructions,
    extensions: { airi: sanitizeAiri(data.extensions?.airi, displayModelId) },
  }
}

function sanitizeAiri(value: unknown, displayModelIdOverride?: string): AiriExtension {
  const source = isRecord(value) ? value : {}
  const modules = isRecord(source.modules) ? source.modules : {}
  const artistry = isRecord(modules.artistry) ? modules.artistry : {}
  const speech = isRecord(modules.speech) ? modules.speech : {}
  const displayModelId = displayModelIdOverride ?? stringValue(modules.displayModelId)

  return {
    modules: {
      consciousness: providerModel(modules.consciousness),
      vision: providerModel(modules.vision),
      speech: {
        ...providerModel(modules.speech),
        voice_id: stringValue(speech.voice_id),
      },
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
    agents: {},
  }
}

function providerModel(value: unknown) {
  const source = isRecord(value) ? value : {}
  return { provider: stringValue(source.provider), model: stringValue(source.model) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function isSpawnMode(value: unknown): value is NonNullable<AiriExtension['modules']['artistry']>['spawnMode'] {
  return value === 'bg' || value === 'widget' || value === 'inline' || value === 'bg_widget'
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
