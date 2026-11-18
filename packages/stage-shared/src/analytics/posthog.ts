import type { BeforeSendFn, PostHogConfig } from 'posthog-js'

/** The browser-safe PostHog project key that every AIRI client surface shares. */
export const POSTHOG_PROJECT_KEY = 'phc_pzjziJjrVZpa9SqnQqq0QEKvkmuCPH7GDTA6TbRTEf9' // cspell:disable-line

const urlPropertyPattern = /(?:url|referrer)$/i

function stripUrlQueries(properties: Record<string, unknown> | undefined): void {
  if (!properties)
    return
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === 'string' && urlPropertyPattern.test(key))
      properties[key] = value.split(/[?#]/, 1)[0]
  }
}

/** Removes query strings and fragments from URL properties, so OAuth codes never enter analytics. */
export const stripPosthogUrlQueries: BeforeSendFn = (event) => {
  stripUrlQueries(event.properties)
  stripUrlQueries(event.$set)
  stripUrlQueries(event.$set_once)
  return event
}

/**
 * Shared PostHog options for AIRI single-page applications.
 *
 * The PostHog project settings decide which capture products run, for example
 * autocapture, exception capture, web vitals, heatmaps, and session replay.
 * The SDK reads them from the remote config, so these options must not set
 * those switches.
 *
 * These options keep only the privacy rules that a project setting must not
 * turn off: URL queries are removed, and session replay masks all text.
 * Page leaves are the one capture switch here, because no project setting controls them.
 */
export const DEFAULT_POSTHOG_CONFIG = {
  api_host: 'https://t.airi.build',
  defaults: '2025-05-24',
  person_profiles: 'identified_only',
  // No report reads page leaves, and they double the page view volume.
  capture_pageleave: false,
  // Chat messages are page text. A replay must never record them.
  session_recording: {
    maskAllInputs: true,
    maskTextSelector: '*',
  },
  before_send: stripPosthogUrlQueries,
} as const satisfies Partial<PostHogConfig>
