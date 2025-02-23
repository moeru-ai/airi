import type { I18n } from './locales'

import { Menu } from 'electron/main'

export function createBasicMenu(
  { t }: I18n,
  createSettingsWindow: () => void,
  onQuitClick: () => void,
): Array<(Electron.MenuItemConstructorOptions)> {
  return [
    {
      role: 'about',
      label: t('menu.about'),
    },
    {
      label: t('menu.settings'),
      click: createSettingsWindow,
    },
    {
      label: t('menu.quit'),
      click: onQuitClick,
    },
  ]
}

export function createTrayMenu(
  i18n: I18n,
  isVisible: boolean,
  onVisibleChange: () => void,
  createSettingsWindow: () => void,
  onQuitClick: () => void,
) {
  const menu = createBasicMenu(i18n, createSettingsWindow, onQuitClick)
  if (isVisible) {
    menu.push({
      label: i18n.t('menu.hide'),
      click: onVisibleChange,
    })
  }
  else {
    menu.push({
      label: i18n.t('menu.show'),
      click: onVisibleChange,
    })
  }
  return Menu.buildFromTemplate(menu)
}

export function createApplicationMenu(
  i18n: I18n,
  onQuitClick: () => void,
  createSettingsWindow: () => void,
) {
  const menu = Menu.buildFromTemplate([
    {
      label: 'airi',
      role: 'appMenu',
      submenu: createBasicMenu(i18n, createSettingsWindow, onQuitClick),
    },
    {
      role: 'editMenu',
    },
  ])
  Menu.setApplicationMenu(menu)
}
