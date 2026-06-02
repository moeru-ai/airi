/**
 * Checks whether a zip entry path should be ignored (macOS metadata / system junk).
 *
 * Use when scanning zip contents to avoid treating system files as model assets.
 */
export function isIgnoredPath(path: string): boolean {
  return path.split(/[\\/]/).some(seg =>
    seg === '__MACOSX'
    || seg === '.DS_Store'
    || seg === 'Thumbs.db'
    || seg.startsWith('._'),
  )
}

/**
 * Normalizes archive paths to the encoded form expected by pixi-live2d-display's FileLoader.
 *
 * Before:
 * - "八千代辉夜姬.8192/texture_00.png"
 * - "%E5%85%AB%E5%8D%83%E4%BB%A3%E8%BE%89%E5%A4%9C%E5%A7%AC.moc3"
 *
 * After:
 * - "%E5%85%AB%E5%8D%83%E4%BB%A3%E8%BE%89%E5%A4%9C%E5%A7%AC.8192/texture_00.png"
 * - "%E5%85%AB%E5%8D%83%E4%BB%A3%E8%BE%89%E5%A4%9C%E5%A7%AC.moc3"
 */
export function encodeArchivePathForFileLoader(path: string): string {
  try {
    return encodeURI(decodeURI(path))
  }
  catch {
    return encodeURI(path)
  }
}

function encodeStringField(record: Record<string, unknown>, field: string): void {
  if (typeof record[field] === 'string')
    record[field] = encodeArchivePathForFileLoader(record[field])
}

function encodeStringArrayField(record: Record<string, unknown>, field: string): void {
  if (!Array.isArray(record[field]))
    return

  record[field] = record[field].map(value =>
    typeof value === 'string'
      ? encodeArchivePathForFileLoader(value)
      : value,
  )
}

function encodeFileEntry(entry: unknown): unknown {
  if (!entry || typeof entry !== 'object')
    return entry

  const fileEntry = entry as Record<string, unknown>
  encodeStringField(fileEntry, 'File')
  encodeStringField(fileEntry, 'Sound')
  return fileEntry
}

/**
 * Normalizes file references inside a parsed model settings JSON.
 *
 * Before:
 * - `{ "FileReferences": { "Moc": "八千代辉夜姬.moc3" } }`
 *
 * After:
 * - `{ "FileReferences": { "Moc": "%E5%85%AB%E5%8D%83%E4%BB%A3%E8%BE%89%E5%A4%9C%E5%A7%AC.moc3" } }`
 */
export function encodeModelSettingsJsonPaths(json: Record<string, unknown>): void {
  const refs = json.FileReferences as Record<string, unknown> | undefined
  if (!refs)
    return

  encodeStringField(refs, 'Moc')
  encodeStringField(refs, 'Physics')
  encodeStringField(refs, 'Pose')
  encodeStringField(refs, 'DisplayInfo')
  encodeStringArrayField(refs, 'Textures')

  if (refs.Motions && typeof refs.Motions === 'object') {
    const motions = refs.Motions as Record<string, unknown>
    for (const [group, list] of Object.entries(motions)) {
      if (Array.isArray(list))
        motions[group] = list.map(encodeFileEntry)
    }
  }

  if (Array.isArray(refs.Expressions))
    refs.Expressions = refs.Expressions.map(encodeFileEntry)
}

/**
 * Normalizes the settings URL after pixi-live2d-display injects it into ModelSettings.
 *
 * Before:
 * - `settings.url === "【雪熊企划】八千代辉夜姬/八千代辉夜姬.model3.json"`
 *
 * After:
 * - `settings.url === "%E3%80%90%E9%9B%AA%E7%86%8A%E4%BC%81%E5%88%92%E3%80%91%E5%85%AB%E5%8D%83%E4%BB%A3%E8%BE%89%E5%A4%9C%E5%A7%AC/%E5%85%AB%E5%8D%83%E4%BB%A3%E8%BE%89%E5%A4%9C%E5%A7%AC.model3.json"`
 */
export function encodeModelSettingsUrl(settings: { url: string, json: object }): void {
  settings.url = encodeArchivePathForFileLoader(settings.url)
  Object.assign(settings.json, { url: settings.url })
}

/**
 * Normalizes a cloned settings JSON for FileLoader-compatible persistence.
 *
 * Before:
 * - `{ "url": "八千代辉夜姬.model3.json", "FileReferences": { "Moc": "八千代辉夜姬.moc3" } }`
 * - `{ "url": "%E5%85%AB%E5%8D%83%E4%BB%A3%E8%BE%89%E5%A4%9C%E5%A7%AC.model3.json", "FileReferences": { "Moc": "%E5%85%AB%E5%8D%83%E4%BB%A3%E8%BE%89%E5%A4%9C%E5%A7%AC.moc3" } }`
 *
 * After:
 * - `{ "url": "%E5%85%AB%E5%8D%83%E4%BB%A3%E8%BE%89%E5%A4%9C%E5%A7%AC.model3.json", "FileReferences": { "Moc": "%E5%85%AB%E5%8D%83%E4%BB%A3%E8%BE%89%E5%A4%9C%E5%A7%AC.moc3" } }`
 * - `{ "url": "%E5%85%AB%E5%8D%83%E4%BB%A3%E8%BE%89%E5%A4%9C%E5%A7%AC.model3.json", "FileReferences": { "Moc": "%E5%85%AB%E5%8D%83%E4%BB%A3%E8%BE%89%E5%A4%9C%E5%A7%AC.moc3" } }`
 */
export function stringifyModelSettingsJsonForFileLoader(input: object): string {
  const settings = JSON.parse(JSON.stringify(input)) as Record<string, unknown>

  if (typeof settings.url === 'string')
    settings.url = encodeArchivePathForFileLoader(settings.url)

  encodeModelSettingsJsonPaths(settings)
  return JSON.stringify(settings)
}

/**
 * Sanitizes a parsed model3.json in place, fixing common data issues that would
 * break the upstream pixi-live2d-display loader.
 *
 * - Removes `FileReferences.Physics`, `Pose`, `DisplayInfo` when explicitly `null`
 * - Filters motion entries with null/empty/non-string `File`
 * - Filters expression entries with null/empty/non-string `File`
 */
export function sanitizeModelSettingsJson(json: Record<string, unknown>): void {
  const refs = json.FileReferences as Record<string, unknown> | undefined
  if (!refs)
    return

  if (refs.Physics === null)
    delete refs.Physics
  if (refs.Pose === null)
    delete refs.Pose
  if (refs.DisplayInfo === null)
    delete refs.DisplayInfo

  if (refs.Motions) {
    const motions = refs.Motions as Record<string, unknown>
    let hasAny = false
    for (const [group, list] of Object.entries(motions)) {
      if (!Array.isArray(list))
        continue
      const filtered = list.filter(
        (m: unknown) => m && typeof (m as Record<string, unknown>).File === 'string' && (m as Record<string, unknown>).File !== '',
      )
      if (filtered.length > 0) {
        motions[group] = filtered
        hasAny = true
      }
      else {
        delete motions[group]
      }
    }
    if (!hasAny)
      delete refs.Motions
  }

  if (refs.Expressions) {
    if (Array.isArray(refs.Expressions)) {
      const filtered = refs.Expressions.filter(
        (e: unknown) => e && typeof (e as Record<string, unknown>).File === 'string' && (e as Record<string, unknown>).File !== '',
      )
      if (filtered.length > 0) {
        refs.Expressions = filtered
      }
      else {
        delete refs.Expressions
      }
    }
  }
}
