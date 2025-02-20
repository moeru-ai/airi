import { describe, expect, it } from 'vitest'

import { createI18n } from '.'

describe('createI18n', () => {
  it('should return the correct locale', () => {
    const { t } = createI18n()
    expect(t('menu.settings')).toBe('Settings')
  })

  it('should return key if the key is not found', () => {
    const { t } = createI18n()
    expect(t('menu.not.found')).toBe('menu.not.found')
  })

  it('should set the correct locale', () => {
    const { t, setLocale } = createI18n()
    setLocale('zh-CN')
    expect(t('menu.settings')).toBe('设置')
  })

  it('should return the correct locale in array', () => {
    const { t } = createI18n()
    expect(t('quitDialog.buttons.0')).toBe('Quit')
    expect(t('quitDialog.buttons.1')).toBe('Cancel')
  })
})
