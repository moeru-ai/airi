import type { Live2DFactoryContext, Middleware, ModelSettings } from 'pixi-live2d-display/cubism4'

// Be skeptical
interface MaybeModelSettingsJSON {
  FileReferences?: {
    DisplayInfo?: string
    Moc?: string
    Physics?: string
    Textures?: string[]
  }
  url?: string
}

// A middleware to URI-encode possible filenames in settings to handle filenames with UTF-8 characters.
export const live2dEncodeFilenamesMiddleware: Middleware<Live2DFactoryContext> = (context, next) => {
  if (typeof context.source !== 'object' || !context.source)
    return next()

  // Be skeptical
  const settings = context.source.settings as Partial<ModelSettings> | undefined
  if (!settings)
    return next()

  if (settings.json && typeof settings.json === 'object') {
    const json = settings.json as MaybeModelSettingsJSON
    if (json.FileReferences && typeof json.FileReferences === 'object') {
      const fr = json.FileReferences
      if (fr && typeof fr === 'object') {
        if (fr.DisplayInfo && typeof fr.DisplayInfo === 'string')
          fr.DisplayInfo = encodeURI(fr.DisplayInfo)
        if (fr.Moc && typeof fr.Moc === 'string')
          fr.Moc = encodeURI(fr.Moc)
        if (fr.Physics && typeof fr.Physics === 'string')
          fr.Physics = encodeURI(fr.Physics)
        if (fr.Textures && Array.isArray(fr.Textures))
          fr.Textures = fr.Textures.map(tex => typeof tex === 'string' ? encodeURI(tex) : tex)
      }
    }

    if (json.url && typeof json.url === 'string')
      json.url = encodeURI(json.url)
  }

  if (settings.moc && typeof settings.moc === 'string')
    settings.moc = encodeURI(settings.moc)
  if (settings.textures && Array.isArray(settings.textures))
    settings.textures = settings.textures.map(tex => typeof tex === 'string' ? encodeURI(tex) : tex)
  if (settings.physics && typeof settings.physics === 'string')
    settings.physics = encodeURI(settings.physics)
  if (settings.url && typeof settings.url === 'string')
    settings.url = encodeURI(settings.url)

  return next()
}
