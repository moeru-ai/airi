import type { Pinia } from 'pinia'
import type { App, Component, Plugin } from 'vue'
import type { I18n } from 'vue-i18n'
import type { Router } from 'vue-router'

import Tres from '@tresjs/core'

import { autoAnimatePlugin } from '@formkit/auto-animate/vue'
import { MotionPlugin } from '@vueuse/motion'
import { createApp } from 'vue'

import { settingsBroadcaster } from './settings-broadcaster'

interface AppInitializationOptions {
  /** Router for the app - must be provided */
  router: Router
  /** Pinia instance for state management */
  pinia: Pinia
  /** I18n instance for internationalization - using any to maintain compatibility with various locale configurations */
  i18n: I18n<any, any, any, any, any>
  /** Optional callback to run before mounting the app */
  beforeMountCallback?: () => void | Promise<void>
  /** Callback to run after the app is initialized but before mounting */
  onInitialized?: (app: App, router: Router) => void | Promise<void>
}

/**
 * Initializes a Vue application with common plugins and services.
 * This function creates a Vue app instance with all the standard plugins
 * and services used across AIRI applications.
 *
 * Note: The router, pinia, and i18n instances must be provided by the caller
 * as they are application-specific and cannot be created in the shared module.
 */
export async function initializeApp(
  AppComponent: Component,
  options: AppInitializationOptions,
): Promise<App> {
  const app = createApp(AppComponent)
    .use(MotionPlugin)
    .use(autoAnimatePlugin as unknown as Plugin) // TODO: Fix autoAnimatePlugin type error
    .use(options.router)
    .use(options.pinia)
    .use(options.i18n)
    .use(Tres)

  // Run any custom initialization logic
  if (options.onInitialized) {
    await options.onInitialized(app, options.router)
  }

  // Initialize settings broadcaster connection
  try {
    await settingsBroadcaster.connect()
  }
  catch (error) {
    console.error('Failed to connect settings broadcaster:', error)
  }

  // Run any custom before-mount logic
  if (options.beforeMountCallback) {
    await options.beforeMountCallback()
  }

  return app
}
