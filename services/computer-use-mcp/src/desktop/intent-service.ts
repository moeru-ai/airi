import type {
  DesktopActionPlan,
  DesktopScene,
  LayoutPresetId,
  LayoutPreview,
} from './types'

const layoutSlots = {
  'coding-dual-pane': {
    slots: [
      { key: 'editor', x: 0, y: 0, w: 0.58, h: 0.7, hints: ['cursor', 'visual studio code', 'code'] },
      { key: 'terminal', x: 0.58, y: 0, w: 0.42, h: 0.45, hints: ['terminal', 'iterm', 'ghostty'] },
      { key: 'browser', x: 0.58, y: 0.45, w: 0.42, h: 0.55, hints: ['chrome', 'safari', 'firefox', 'arc'] },
      { key: 'airi', x: 0, y: 0.7, w: 0.58, h: 0.3, hints: ['airi'] },
    ],
  },
  'review-mode': {
    slots: [
      { key: 'editor', x: 0, y: 0, w: 0.6, h: 1, hints: ['cursor', 'visual studio code', 'code'] },
      { key: 'review', x: 0.6, y: 0, w: 0.4, h: 0.65, hints: ['chrome', 'safari', 'firefox', 'arc', 'diff'] },
      { key: 'airi', x: 0.6, y: 0.65, w: 0.4, h: 0.35, hints: ['airi'] },
    ],
  },
  'agent-watch': {
    slots: [
      { key: 'airi', x: 0, y: 0, w: 0.4, h: 0.55, hints: ['airi'] },
      { key: 'terminal', x: 0.4, y: 0, w: 0.6, h: 0.55, hints: ['terminal', 'iterm', 'ghostty'] },
      { key: 'logs', x: 0, y: 0.55, w: 0.4, h: 0.45, hints: ['log', 'console'] },
      { key: 'browser', x: 0.4, y: 0.55, w: 0.6, h: 0.45, hints: ['chrome', 'safari', 'firefox', 'arc'] },
    ],
  },
} satisfies Record<LayoutPresetId, {
  slots: Array<{ key: string, x: number, y: number, w: number, h: number, hints: string[] }>
}>

function makePlanId() {
  return `layout_plan_${Date.now().toString(36)}`
}

function choosePrimaryScreen(scene: DesktopScene) {
  return scene.screens[0]
}

function normalize(value: string | undefined) {
  return (value || '').trim().toLowerCase()
}

function matchScore(
  appName: string,
  title: string,
  hints: string[],
) {
  const app = normalize(appName)
  const text = `${app} ${normalize(title)}`
  let score = 0

  for (const hint of hints) {
    if (text.includes(hint)) {
      score += 5
    }
  }

  return score
}

export class DesktopIntentService {
  previewLayout(
    scene: DesktopScene,
    layoutId: LayoutPresetId,
    onlyWindowIds?: string[],
  ): LayoutPreview {
    const primary = choosePrimaryScreen(scene)
    if (!primary) {
      return {
        layoutId,
        targets: [],
        focusOrder: [],
        unresolvedWindowIds: onlyWindowIds || scene.windows.map(window => window.id),
        notes: ['no_screen_available_for_layout_preview'],
      }
    }

    const candidateWindows = onlyWindowIds?.length
      ? onlyWindowIds
          .map(windowId => scene.windows.find(window => window.id === windowId))
          .filter((window): window is DesktopScene['windows'][number] => Boolean(window))
      : scene.windows

    const assignedWindowIds = new Set<string>()
    const targets: LayoutPreview['targets'] = []

    if (onlyWindowIds?.length) {
      for (const [index, slot] of layoutSlots[layoutId].slots.entries()) {
        const selected = candidateWindows[index]
        if (!selected) {
          continue
        }

        assignedWindowIds.add(selected.id)
        targets.push({
          windowId: selected.id,
          bounds: {
            x: Math.round(primary.bounds.x + primary.bounds.width * slot.x),
            y: Math.round(primary.bounds.y + primary.bounds.height * slot.y),
            width: Math.max(1, Math.round(primary.bounds.width * slot.w)),
            height: Math.max(1, Math.round(primary.bounds.height * slot.h)),
          },
          reason: `slot=${slot.key};assignment=explicit_order`,
        })
      }
    }
    else {
      for (const slot of layoutSlots[layoutId].slots) {
        const ranked = [...candidateWindows]
          .filter(window => !assignedWindowIds.has(window.id))
          .map(window => ({
            window,
            score: matchScore(window.appName, window.title, slot.hints),
          }))
          .sort((left, right) => right.score - left.score)

        const selected = ranked[0]
        if (!selected || selected.score <= 0) {
          continue
        }

        assignedWindowIds.add(selected.window.id)
        targets.push({
          windowId: selected.window.id,
          bounds: {
            x: Math.round(primary.bounds.x + primary.bounds.width * slot.x),
            y: Math.round(primary.bounds.y + primary.bounds.height * slot.y),
            width: Math.max(1, Math.round(primary.bounds.width * slot.w)),
            height: Math.max(1, Math.round(primary.bounds.height * slot.h)),
          },
          reason: `slot=${slot.key};score=${selected.score}`,
        })
      }
    }

    const unresolvedExplicitWindowIds = onlyWindowIds?.filter(windowId => !candidateWindows.some(window => window.id === windowId)) || []
    const unresolvedCandidateWindowIds = candidateWindows
      .filter(window => !assignedWindowIds.has(window.id))
      .map(window => window.id)
    const unresolvedWindowIds = [...unresolvedExplicitWindowIds, ...unresolvedCandidateWindowIds]

    return {
      layoutId,
      targets,
      focusOrder: targets.map(target => target.windowId),
      unresolvedWindowIds,
      notes: [
        'semantic_layout_plan_generated',
        'preview_first_apply_second',
        onlyWindowIds?.length
          ? 'explicit_window_ids_assigned_by_caller_order'
          : 'auto_matching_requires_positive_hint_score',
      ],
    }
  }

  toActionPlan(preview: LayoutPreview): DesktopActionPlan {
    const steps: DesktopActionPlan['steps'] = []
    for (const target of preview.targets) {
      steps.push({
        kind: 'move_resize_window',
        windowId: target.windowId,
        bounds: target.bounds,
      })
    }

    const firstFocusable = preview.focusOrder[0]
    if (firstFocusable) {
      steps.push({
        kind: 'focus_window',
        windowId: firstFocusable,
      })
    }

    return {
      id: makePlanId(),
      createdAt: new Date().toISOString(),
      steps,
    }
  }
}
