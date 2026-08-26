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
      description: `Make sure ${app} is open and in the foreground.`,
      kind: 'ensure_app',
      label: `Open ${app}`,
      params: { app },
    },
    {
      description: 'Give the app a moment to finish launching or rendering.',
      kind: 'wait',
      label: 'Wait for app to settle',
      params: { durationMs: 1500 },
      skippable: true,
    },
  ]

  // If a URL is provided, type it into the address bar.
  if (url) {
    steps.push(
      {
        description: 'Press Cmd+L to focus the browser address bar.',
        kind: 'press_shortcut',
        label: 'Focus address bar',
        params: { keys: ['command', 'l'] },
      },
      {
        description: `Type the target URL and press Enter.`,
        kind: 'type_into',
        label: `Navigate to ${url}`,
        params: { pressEnter: true, text: url },
      },
      {
        description: 'Wait for the page to finish loading.',
        kind: 'wait',
        label: 'Wait for page to load',
        params: { durationMs: 3000 },
      },
    )
  }

  steps.push(
    {
      description: `Take a screenshot to see what ${app} is currently showing.`,
      kind: 'take_screenshot',
      label: 'Observe current state',
      params: { label: 'app-observation' },
    },
    {
      description: 'Get a list of all visible windows to understand the full desktop context.',
      kind: 'observe_windows',
      label: 'List visible windows',
      params: { limit: 10 },
      skippable: true,
    },
    {
      description: `Based on the screenshot and window list, determine the next action to progress toward: ${goal}.`,
      kind: 'evaluate',
      label: 'Evaluate and plan next action',
      params: {},
    },
    {
      description: 'Summarize what was observed and what actions are recommended next.',
      kind: 'summarize',
      label: 'Summarize progress',
      params: {},
    },
  )

  return {
    description: `Open ${app}, observe the current state, and progress toward: ${goal}.`,
    id: 'app_browse_and_act',
    maxRetries: 3,
    name: `Browse and act in ${app}`,
    steps,
  }
}
