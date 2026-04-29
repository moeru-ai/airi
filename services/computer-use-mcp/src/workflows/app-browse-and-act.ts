/**
 * Workflow: App → Browse & Act
 *
 * Opens a specified application (typically a browser), observes the
 * current UI state, and then uses tools to progress toward a goal.
 *
 * This is the most general-purpose workflow and serves as the template
 * for visual automation tasks.
 *
 * Parameterised by:
 *   - app: the application to open and interact with
 *   - goal: a short description of what to accomplish
 *   - url: optional URL to navigate to (for browsers)
 */

import type { WorkflowDefinition } from './types'

export function createAppBrowseAndActWorkflow(params?: {
  app?: string
  goal?: string
  url?: string
}): WorkflowDefinition {
  const app = params?.app ?? 'Google Chrome'
  const goal = params?.goal ?? 'observe and interact with the application'
  const url = params?.url

  const steps: WorkflowDefinition['steps'] = [
    {
      label: `Open ${app}`,
      kind: 'ensure_app',
      description: `Make sure ${app} is open and in the foreground.`,
      params: { app },
    },
    {
      label: 'Wait for app to settle',
      kind: 'wait',
      description: 'Give the app a moment to finish launching or rendering.',
      params: { durationMs: 1500 },
      skippable: true,
    },
  ]

  // If a URL is provided, type it into the address bar.
  if (url) {
    steps.push(
      {
        label: 'Focus address bar',
        kind: 'press_shortcut',
        description: 'Press Cmd+L to focus the browser address bar.',
        params: { keys: ['command', 'l'] },
      },
      {
        label: `Navigate to ${url}`,
        kind: 'type_into',
        description: `Type the target URL and press Enter.`,
        params: { text: url, pressEnter: true },
      },
      {
        label: 'Wait for page to load',
        kind: 'wait',
        description: 'Wait for the page to finish loading.',
        params: { durationMs: 3000 },
      },
    )
  }

  steps.push(
    {
      label: 'Observe current state',
      kind: 'take_screenshot',
      description: `Take a screenshot to see what ${app} is currently showing.`,
      params: { label: 'app-observation' },
    },
    {
      label: 'List visible windows',
      kind: 'observe_windows',
      description: 'Get a list of all visible windows to understand the full desktop context.',
      params: { limit: 10 },
      skippable: true,
    },
    {
      label: 'Evaluate and plan next action',
      kind: 'evaluate',
      description: `Based on the screenshot and window list, determine the next action to progress toward: ${goal}.`,
      params: {},
    },
    {
      label: 'Summarize progress',
      kind: 'summarize',
      description: 'Summarize what was observed and what actions are recommended next.',
      params: {},
    },
  )

  return {
    id: 'app_browse_and_act',
    name: `Browse and act in ${app}`,
    description: `Open ${app}, observe the current state, and progress toward: ${goal}.`,
    maxRetries: 3,
    steps,
  }
}
