import type { ModelAssetStatus } from '@proj-airi/stage-shared/model-assets'

import { sherpawModels } from '@proj-airi/provider-inference/sherpaw-transcription/models'
import { settingsSearchItemKey } from '@proj-airi/stage-shared/settings-search'
import { speakerModel } from '@proj-airi/stage-shared/speaker-model'
import { isSherpawModelBundled } from '@proj-airi/stage-ui/libs/providers/providers/sherpaw/model-assets'
import { kwsModel } from '@proj-airi/stage-ui/libs/voice/kws-model-info'

const names = new Map<string, string>(Object.values(sherpawModels).map(model => [model.id, model.name]))
// Transcription presets show their recognizer family. The wake word and voiceprint packs have no family name users know.
const packNameKeys = new Map<string, string>([
  [kwsModel.id, 'settings.pages.data.sections.model-downloads.wake-word-model'],
  [speakerModel.id, 'settings.pages.data.sections.model-downloads.voiceprint-model'],
])

/** The marker of a downloaded model's row. The section and the settings search share it. */
export function downloadedModelSearchKey(id: string) {
  return settingsSearchItemKey('downloaded-model', id)
}

/**
 * The speech models that this device downloaded, or is downloading, with the names that the data page shows.
 * A model bundled with the app is not a download, so it is not here.
 */
export function downloadedModelsOf(models: readonly ModelAssetStatus[], t: (key: string) => string) {
  return models.flatMap((status) => {
    const nameKey = packNameKeys.get(status.id)
    const name = nameKey ? t(nameKey) : names.get(status.id)
    if (!name || isSherpawModelBundled(status.id) || (status.state !== 'installed' && status.state !== 'downloading'))
      return []
    return [{ ...status, name }]
  })
}
