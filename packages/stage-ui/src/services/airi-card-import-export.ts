import type { Card, ccv3 } from '@proj-airi/ccc'

import type { useDisplayModelsStore } from '../stores/display-models'
import type { AiriCard, AiriExtension } from '../stores/modules/airi-card'

import JSZip from 'jszip'

import { exportToJSON } from '@proj-airi/ccc'

import { DisplayModelFormat } from '../stores/display-models'

const FORMAT = 'airi-character-card'
const VERSION = 1
const CARD_PATH = 'card.json'
const MANIFEST_PATH = 'manifest.json'
const MODEL_EXT = {
  [DisplayModelFormat.Live2dZip]: 'zip',
  [DisplayModelFormat.SpineZip]: 'zip',
  [DisplayModelFormat.VRM]: 'vrm',
} as const

type SupportedDisplayModelFormat = keyof typeof MODEL_EXT
type DisplayModelsStore = ReturnType<typeof useDisplayModelsStore>
type ExportableCard = Card & { extensions: { airi: AiriExtension } }

interface Manifest {
  format: typeof FORMAT
  version: typeof VERSION
  createdAt: string
  card: { path: typeof CARD_PATH, spec: 'chara_card_v3' }
  resources?: {
    displayModel?: { path: string, format: SupportedDisplayModelFormat, name: string }
  }
}

export type AiriCardPackageErrorCode = 'missing-file' | 'invalid-file'

export interface ExportAiriCardPackageOptions {
  card: AiriCard
  displayModelsStore: DisplayModelsStore
}

export interface ImportAiriCardPackageOptions {
  file: File
  displayModelsStore: DisplayModelsStore
}

export class AiriCardPackageError extends Error {
  constructor(public readonly code: AiriCardPackageErrorCode, message: string) {
    super(message)
    this.name = 'AiriCardPackageError'
  }
}

/** Creates character card package download filenames from the character name. */
export function createAiriCardPackageFileName(card: Pick<AiriCard, 'name'>): string {
  return `${card.name.trim()}.zip`
}

/** Exports only the creation/edit form whitelist; provider globals and runtime state are never cloned. */
export async function exportAiriCardPackage({ card, displayModelsStore }: ExportAiriCardPackageOptions): Promise<Blob> {
  const exportableCard = cardFromAiriCard(card)
  const displayModel = await exportDisplayModel(exportableCard, displayModelsStore)
  const manifest: Manifest = {
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
    zip.file(displayModel.manifest.path, await displayModel.file.arrayBuffer())

  return zip.generateAsync({ type: 'blob' })
}

/** Imports a package as sanitized CCv3 JSON; edited zip payloads cannot smuggle extra AIRI fields through. */
export async function importAiriCardPackage({ file, displayModelsStore }: ImportAiriCardPackageOptions): Promise<ccv3.CharacterCardV3> {
  const zip = await loadZip(file)
  const manifest = await readJsonFile(zip, MANIFEST_PATH, isManifest)
  const cardJson = await readJsonFile(zip, manifest.card.path, isCharacterCardV3)
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

  if (model.type === 'url')
    return
  if (!isSupportedDisplayModelFormat(model.format) || model.file.size <= 0)
    throw error('invalid-file', 'Unsupported or empty local display model')

  return {
    file: model.file,
    manifest: {
      format: model.format,
      name: model.file.name,
      path: `models/body-model.${MODEL_EXT[model.format]}`,
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

  const data = await file.async('arraybuffer')
  return (await store.addDisplayModel(resource.format, new File([data], resource.name))).id
}

async function loadZip(file: File) {
  try {
    return await JSZip.loadAsync(await file.arrayBuffer())
  }
  catch {
    throw error('invalid-file', 'Invalid zip file')
  }
}

async function readJsonFile<T>(zip: JSZip, path: string, guard: (value: unknown) => value is T): Promise<T> {
  const file = zip.file(path)
  if (!file)
    throw error('missing-file', `Missing ${path}`)

  const value = parseJson(await file.async('string'))
  if (!guard(value))
    throw error('invalid-file', `Invalid ${path}`)
  return value
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

function cardFromCharacterCard(card: ccv3.CharacterCardV3, displayModelId?: string): ExportableCard {
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
  const modules = record(record(value).modules)
  const artistry = record(modules.artistry)
  const displayModelId = displayModelIdOverride ?? text(modules.displayModelId)

  return {
    modules: {
      consciousness: providerModel(modules.consciousness),
      vision: providerModel(modules.vision),
      speech: {
        ...providerModel(modules.speech),
        voice_id: text(record(modules.speech).voice_id),
      },
      ...(displayModelId ? { displayModelId } : {}),
      artistry: {
        ...(pickText(artistry, 'provider')),
        ...(pickText(artistry, 'model')),
        ...(pickText(artistry, 'promptPrefix')),
        ...(pickText(artistry, 'widgetInstruction')),
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
  const source = record(value)
  return { provider: text(source.provider), model: text(source.model) }
}

function parseJson(content: string) {
  try {
    return JSON.parse(content) as unknown
  }
  catch {
    throw error('invalid-file', 'Invalid JSON')
  }
}

function isManifest(value: unknown): value is Manifest {
  const manifest = record(value)
  const card = record(manifest.card)
  const displayModel = record(record(manifest.resources).displayModel)
  const hasDisplayModel = 'resources' in manifest

  return manifest.format === FORMAT
    && manifest.version === VERSION
    && card.path === CARD_PATH
    && card.spec === 'chara_card_v3'
    && (!hasDisplayModel || (
      typeof displayModel.path === 'string'
      && isSupportedDisplayModelFormat(displayModel.format)
      && typeof displayModel.name === 'string'
    ))
}

function isCharacterCardV3(value: unknown): value is ccv3.CharacterCardV3 {
  const data = record(record(value).data)
  return record(value).spec === 'chara_card_v3'
    && record(value).spec_version === '3.0'
    && typeof data.name === 'string'
}

function pickText(source: Record<string, unknown>, key: string) {
  return typeof source[key] === 'string' ? { [key]: source[key] } : {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSupportedDisplayModelFormat(value: unknown): value is SupportedDisplayModelFormat {
  return value === DisplayModelFormat.Live2dZip || value === DisplayModelFormat.SpineZip || value === DisplayModelFormat.VRM
}

function isSpawnMode(value: unknown): value is NonNullable<AiriExtension['modules']['artistry']>['spawnMode'] {
  return value === 'bg' || value === 'widget' || value === 'inline' || value === 'bg_widget'
}

function error(code: AiriCardPackageErrorCode, message: string) {
  return new AiriCardPackageError(code, message)
}
