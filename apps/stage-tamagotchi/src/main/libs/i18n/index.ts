import type {
  CoreOptions,
  IsEmptyObject,
  LocaleDetector,
  NamedValue,
  PickupPaths,
  RemovedIndexResources,
  TranslateOptions,
} from '@intlify/core'

import { useLogg } from '@guiiai/logg'
import { createCoreContext, translate } from '@intlify/core'
import { effect, signal } from 'alien-signals'
import { isString } from 'es-toolkit'

type ResolveResourceKeys<
  // eslint-disable-next-line ts/no-empty-object-type
  Schema extends Record<string, any> = {},
  // eslint-disable-next-line ts/no-empty-object-type
  DefineLocaleMessageSchema extends Record<string, any> = {},
  DefinedLocaleMessage extends
  RemovedIndexResources<DefineLocaleMessageSchema> = RemovedIndexResources<DefineLocaleMessageSchema>,
  SchemaPaths = IsEmptyObject<Schema> extends false
    ? PickupPaths<{ [K in keyof Schema]: Schema[K] }>
    : never,
  DefineMessagesPaths = IsEmptyObject<DefinedLocaleMessage> extends false
    ? PickupPaths<{
      [K in keyof DefinedLocaleMessage]: DefinedLocaleMessage[K]
    }>
    : never,
> = SchemaPaths | DefineMessagesPaths

interface TranslationFunction<
  // eslint-disable-next-line ts/no-empty-object-type
  Schema extends Record<string, any> = {},
  // eslint-disable-next-line ts/no-empty-object-type
  DefineLocaleMessageSchema extends Record<string, any> = {},
  ResourceKeys = ResolveResourceKeys<Schema, DefineLocaleMessageSchema>,
> {
  /**
   * @param {Key | ResourceKeys} key - A translation key
   * @returns {string} A translated message, if the key is not found, return the key
   */
  <Key extends string>(key: Key | ResourceKeys): string
  /**
   * @param {Key | ResourceKeys} key - A translation key
   * @param {number} plural - A plural choice number
   * @returns {string} A translated message, if the key is not found, return the key
   */
  <Key extends string>(key: Key | ResourceKeys, plural: number): string
  /**
   * @param {Key | ResourceKeys} key - A translation key
   * @param {number} plural - A plural choice number
   * @param {TranslateOptions} options - A translate options, about details see {@link TranslateOptions}
   * @returns {string} A translated message, if the key is not found, return the key
   */
  <Key extends string>(key: Key | ResourceKeys, plural: number, options: TranslateOptions): string
  /**
   * @param {Key | ResourceKeys} key - A translation key
   * @param {string} defaultMsg - A default message, if the key is not found
   * @returns {string} A translated message, if the key is not found, return the `defaultMsg` argument
   */
  <Key extends string>(key: Key | ResourceKeys, defaultMsg: string): string
  /**
   * @param {Key | ResourceKeys} key - A translation key
   * @param {string} defaultMsg - A default message, if the key is not found
   * @param {TranslateOptions} options - A translate options, about details see {@link TranslateOptions}
   * @returns {string} A translated message, if the key is not found, return the `defaultMsg` argument
   */
  <Key extends string>(
    key: Key | ResourceKeys,
    defaultMsg: string,
    options: TranslateOptions
  ): string
  /**
   * @param {Key | ResourceKeys} key - A translation key
   * @param {unknown[]} list - A list for list interpolation
   * @returns {string} A translated message, if the key is not found, return the key
   */
  <Key extends string>(key: Key | ResourceKeys, list: unknown[]): string
  /**
   * @param {Key | ResourceKeys} key - A translation key
   * @param {unknown[]} list - A list for list interpolation
   * @param {number} plural - A plural choice number
   * @returns {string} A translated message, if the key is not found, return the key
   */
  <Key extends string>(key: Key | ResourceKeys, list: unknown[], plural: number): string
  /**
   * @param {Key | ResourceKeys} key - A translation key
   * @param {unknown[]} list - A list for list interpolation
   * @param {string} defaultMsg - A default message, if the key is not found
   * @returns {string} A translated message, if the key is not found, return the `defaultMsg` argument
   */
  <Key extends string>(key: Key | ResourceKeys, list: unknown[], defaultMsg: string): string
  /**
   * @param {Key | ResourceKeys} key - A translation key
   * @param {unknown[]} list - A list for list interpolation
   * @param {TranslateOptions} options - A translate options, about details see {@link TranslateOptions}
   * @returns {string} A translated message, if the key is not found, return the key
   */
  <Key extends string>(key: Key | ResourceKeys, list: unknown[], options: TranslateOptions): string
  /**
   * @param {Key | ResourceKeys} key - A translation key
   * @param {NamedValue} named - A named value for named interpolation
   * @returns {string} A translated message, if the key is not found, return the key
   */
  <Key extends string>(key: Key | ResourceKeys, named: NamedValue): string
  /**
   * @param {Key | ResourceKeys} key - A translation key
   * @param {NamedValue} named - A named value for named interpolation
   * @param {number} plural - A plural choice number
   * @returns {string} A translated message, if the key is not found, return the key
   */
  <Key extends string>(key: Key | ResourceKeys, named: NamedValue, plural: number): string
  /**
   * @param {Key | ResourceKeys} key - A translation key
   * @param {NamedValue} named - A named value for named interpolation
   * @param {string} defaultMsg - A default message, if the key is not found
   * @returns {string} A translated message, if the key is not found, return the `defaultMsg` argument
   */
  <Key extends string>(key: Key | ResourceKeys, named: NamedValue, defaultMsg: string): string
  /**
   * @param {Key | ResourceKeys} key - A translation key
   * @param {NamedValue} named - A named value for named interpolation
   * @param {TranslateOptions} options - A translate options, about details see {@link TranslateOptions}
   * @returns {string} A translated message, if the key is not found, return the key
   */
  <Key extends string>(
    key: Key | ResourceKeys,
    named: NamedValue,
    options: TranslateOptions
  ): string
}

export interface I18n<Schema extends Record<string, any> = Record<string, any>> {
  t: TranslationFunction<Schema>
  locale:
    (() => (string | LocaleDetector<any[]> | undefined)) | ((value: string | LocaleDetector<any[]> | undefined) => void)
}

export function createI18n<Schema extends Record<string, any> = Record<string, any>>(options: CoreOptions): I18n<Schema> {
  const log = useLogg('i18n').useGlobalConfig()

  const locale = signal(options.locale)

  const context = createCoreContext({
    fallbackLocale: options.fallbackLocale,
    fallbackWarn: false,
    missingWarn: false,
    warnHtmlMessage: false,
    fallbackFormat: true,
    ...options,
  })

  const t: TranslationFunction<Schema> = (
    key: string,
    ...args: unknown[]
  ) => {
    if (context == null) {
      log.error('cannot initialize core context for i18n')

      return key
    }

    const ret = Reflect.apply(translate, null, [context, key, ...args])
    return isString(ret) ? ret : key
  }

  effect(() => {
    locale()

    if (context != null) {
      const l = locale()
      if (l != null) {
        context.locale = l
      }
    }
  })

  return {
    t,
    locale,
  }
}
