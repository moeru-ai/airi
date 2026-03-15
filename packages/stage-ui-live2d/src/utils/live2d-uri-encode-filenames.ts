import type { Live2DFactoryContext, Middleware, ModelSettings } from 'pixi-live2d-display/cubism4'

function tryEncode(obj: any, prop: string | number) {
  if (obj?.[prop] && typeof obj[prop] === 'string') {
    obj[prop] = encodeURI(obj[prop])
  }
}

// A middleware to URI-encode possible filenames in settings to handle filenames with UTF-8 characters.
export const live2dEncodeFilenamesMiddleware: Middleware<Live2DFactoryContext> = (context, next) => {
  if (typeof context.source !== 'object' || !context.source)
    return next()

  // Be skeptical
  const settings = context.source.settings as Partial<ModelSettings> | undefined
  if (!settings)
    return next()

  tryEncode(settings, 'moc')
  if (Array.isArray(settings.textures)) {
    for (let i = 0; i < settings.textures.length; i++) {
      tryEncode(settings.textures, i)
    }
  }
  tryEncode(settings, 'physics')
  tryEncode(settings, 'url')

  return next()
}
