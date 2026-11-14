import type { Activity, DisplayLabels } from './model'

const meanings = new Map([
  ['睡眠', 'sleep'],
  ['仕事', 'work'],
  ['食事', 'meal'],
  ['趣味', 'hobby'],
  ['入浴', 'bathing'],
  ['移動', 'travel'],
] as const)

export interface ActivityLabelSource {
  activityId: string
  sourceLabel: string
  category: Activity['category']
  displayLabels?: DisplayLabels
}

export function describeActivityLabel(activity: Pick<Activity, 'id' | 'label' | 'category' | 'displayLabels'>, locale: string, translate: (key: string) => string) {
  return localizeActivityLabel({ activityId: activity.id, sourceLabel: activity.label, category: activity.category, displayLabels: activity.displayLabels }, locale, translate)
}

/** Exact recognized source text is presentation metadata. It never changes the saved sleep category. */
export function localizeActivityLabel(source: ActivityLabelSource, locale: string, translate: (key: string) => string) {
  const semanticLabel = [...meanings].find(([label]) => label === source.sourceLabel)?.[1] ?? null
  const custom = Object.entries(source.displayLabels ?? {}).find(([key]) => key === locale)?.[1]
  return {
    ...source,
    semanticLabel,
    displayLabel: custom ?? (semanticLabel ? translate(`routines.labels.${semanticLabel}`) : source.sourceLabel),
  }
}
