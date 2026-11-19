import type { ElectronScenario, ScenarioContext } from '@vishot/source-electron'
import type { Page } from 'playwright'

import type { StageWindowName, StageWindowSnapshot } from './runtime/windows'

import { defineScenario } from '@vishot/source-electron'

import {
  clickBesideControlsMenu,
  expectControlsMenuBesideMoreButton,
  openControlsMenuFromCharacter,
  openControlsMenuFromMoreButton,
  waitForControlsMenuPage,
  waitForControlsMenuWindow,
} from './runtime/controls-menu'
import { swipe } from './runtime/gestures'
import { dismissDialog, dismissDrawer, swipeDownDrawer } from './runtime/overlays'
import { expandControlsIsland, openChatFromControlsIsland, openHearingFromControlsIsland, openSettingsFromControlsIsland, waitForControlsIslandReady } from './runtime/selectors'
import { goToSettingsConnectionPage, goToSettingsRoute } from './runtime/settings'
import { waitForStageWindow } from './runtime/windows'

export interface StageWindowsApi {
  waitFor: (name: StageWindowName, timeout?: number) => Promise<StageWindowSnapshot>
}

export interface ControlsIslandApi {
  waitForReady: (page: Page) => Promise<void>
  expand: (page: Page) => Promise<void>
  openSettings: (page: Page) => Promise<StageWindowSnapshot>
  openChat: (page: Page) => Promise<StageWindowSnapshot>
  openHearing: (page: Page) => Promise<Page>
}

/** The app menu of the Island, which opens in a window of its own. */
export interface ControlsMenuApi {
  /** Finds the page of the menu window without showing the window. */
  waitForPage: (timeout?: number) => Promise<Page>
  /** Waits until the menu window shows or hides. */
  waitForWindow: (state: 'shown' | 'hidden') => Promise<void>
  openFromMoreButton: (mainPage: Page, menuPage: Page) => Promise<void>
  openFromCharacter: (mainPage: Page, menuPage: Page) => Promise<void>
  /** Throws unless the menu opened 8px beside the more button, level with it, on the screen. */
  expectBesideMoreButton: (mainPage: Page, menuPage: Page) => Promise<void>
  /** Clicks the menu window away from the menu, which closes the menu. */
  clickBeside: (menuPage: Page) => Promise<void>
}

export interface SettingsWindowApi {
  waitFor: (timeout?: number) => Promise<StageWindowSnapshot>
  goToConnection: (page: Page) => Promise<Page>
  goToRoute: (page: Page, routePath: string) => Promise<Page>
}

export interface DialogsApi {
  dismiss: (page: Page) => Promise<void>
}

export interface DrawersApi {
  swipeDown: (page: Page) => Promise<void>
  dismiss: (page: Page) => Promise<void>
}

export interface GesturesApi {
  swipe: typeof swipe
}

/**
 * Generic Vishot Electron context plus AIRI stage-tamagotchi navigation helpers.
 */
export interface StageTamagotchiScenarioContext extends ScenarioContext {
  stageWindows: StageWindowsApi
  controlsIsland: ControlsIslandApi
  controlsMenu: ControlsMenuApi
  settingsWindow: SettingsWindowApi
  dialogs: DialogsApi
  drawers: DrawersApi
  gestures: GesturesApi
}

export interface StageTamagotchiScenario {
  id: string
  run: (context: StageTamagotchiScenarioContext) => Promise<void>
}

/**
 * Adds AIRI-specific window and overlay helpers to Vishot's generic Electron context.
 */
export function createStageTamagotchiScenarioContext(context: ScenarioContext): StageTamagotchiScenarioContext {
  return {
    ...context,
    stageWindows: {
      waitFor(name, timeout) {
        return waitForStageWindow(context.electronApp, name, timeout)
      },
    },
    controlsIsland: {
      waitForReady(page) {
        return waitForControlsIslandReady(page)
      },
      async expand(page) {
        await expandControlsIsland(page)
      },
      async openSettings(page) {
        await openSettingsFromControlsIsland(page)
        return waitForStageWindow(context.electronApp, 'settings')
      },
      async openChat(page) {
        await openChatFromControlsIsland(page)
        return waitForStageWindow(context.electronApp, 'chat')
      },
      openHearing(page) {
        return openHearingFromControlsIsland(page)
      },
    },
    controlsMenu: {
      waitForPage(timeout) {
        return waitForControlsMenuPage(context.electronApp, timeout)
      },
      waitForWindow(state) {
        return waitForControlsMenuWindow(context.electronApp, state)
      },
      openFromMoreButton(mainPage, menuPage) {
        return openControlsMenuFromMoreButton(context.electronApp, mainPage, menuPage)
      },
      openFromCharacter(mainPage, menuPage) {
        return openControlsMenuFromCharacter(context.electronApp, mainPage, menuPage)
      },
      expectBesideMoreButton(mainPage, menuPage) {
        return expectControlsMenuBesideMoreButton(context.electronApp, mainPage, menuPage)
      },
      clickBeside(menuPage) {
        return clickBesideControlsMenu(menuPage)
      },
    },
    settingsWindow: {
      waitFor(timeout) {
        return waitForStageWindow(context.electronApp, 'settings', timeout)
      },
      goToConnection(page) {
        return goToSettingsConnectionPage(page)
      },
      goToRoute(page, routePath) {
        return goToSettingsRoute(page, routePath)
      },
    },
    dialogs: {
      dismiss(page) {
        return dismissDialog(page)
      },
    },
    drawers: {
      swipeDown(page) {
        return swipeDownDrawer(page)
      },
      dismiss(page) {
        return dismissDrawer(page)
      },
    },
    gestures: {
      swipe,
    },
  }
}

/**
 * Defines an AIRI stage-tamagotchi Electron scenario for Vishot's generic source runner.
 */
export function defineStageTamagotchiScenario(scenario: StageTamagotchiScenario): ElectronScenario {
  return defineScenario({
    id: scenario.id,
    run(context) {
      return scenario.run(createStageTamagotchiScenarioContext(context))
    },
  })
}
