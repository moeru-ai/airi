/** Tool sources that a session can expose to its model. Client adapters register tools under `client`. */
export type SessionToolGroup = 'application' | 'web-search' | 'mcp' | 'plugins' | 'computer-use' | 'home-assistant' | 'desktop' | 'client'

/** Session choices restrict configured modules. They do not configure providers or grant device access. */
export interface SessionFeatures {
  speech: boolean
  reactions: boolean
  stickers: boolean
  cards: boolean
  skills: boolean
  tasks: boolean
  artistry: boolean
  memory: 'off' | 'read' | 'write'
  tools: readonly SessionToolGroup[]
  screen: boolean
  modules: boolean
}

/** Omitted properties follow the user's current defaults, including after those defaults change. */
export type SessionFeatureOverrides = Partial<Omit<SessionFeatures, 'tools'>> & {
  tools?: Partial<Record<SessionToolGroup, boolean>>
}

/** A whole feature or one tool source whose explicit choice can be restored to defaults. */
export type SessionFeatureKey = keyof SessionFeatures | `tools.${SessionToolGroup}`

/** Existing module settings remain the availability gate until the user restricts a feature. */
export const DEFAULT_SESSION_FEATURES: Readonly<SessionFeatures> = Object.freeze({
  speech: true,
  reactions: true,
  stickers: true,
  cards: true,
  skills: true,
  tasks: true,
  artistry: true,
  memory: 'write',
  tools: Object.freeze(['application', 'web-search', 'mcp', 'plugins', 'computer-use', 'home-assistant', 'desktop', 'client'] satisfies SessionToolGroup[]),
  screen: true,
  modules: true,
})

/** Captures an independent request snapshot. An explicit value remains explicit even when it equals the default. */
export function resolveSessionFeatures(defaults: Readonly<SessionFeatures>, overrides?: SessionFeatureOverrides): SessionFeatures {
  return {
    ...defaults,
    ...overrides,
    tools: DEFAULT_SESSION_FEATURES.tools.filter(group => overrides?.tools?.[group] ?? defaults.tools.includes(group)),
  }
}

/**
 * Merges explicit choices without fixing unrelated tool sources. Restore keys remove choices and empty tool maps.
 * Passing no change restores all choices. The returned object owns its tool map.
 */
export function updateSessionFeatureOverrides(current: SessionFeatureOverrides | undefined, change?: SessionFeatureOverrides, restore?: readonly SessionFeatureKey[]): SessionFeatureOverrides {
  const updated: SessionFeatureOverrides = change ? { ...current, ...change } : {}
  if (change && (current?.tools || change.tools))
    updated.tools = { ...current?.tools, ...change.tools }
  if (restore) {
    for (const key of restore) {
      if (key.startsWith('tools.'))
        delete updated.tools?.[key.slice('tools.'.length) as SessionToolGroup]
      else
        delete updated[key as keyof SessionFeatures]
    }
  }
  if (updated.tools && !Object.keys(updated.tools).length)
    delete updated.tools
  return updated
}

/** Task sessions cannot obtain capabilities that their parent conversation withheld. */
export function restrictSessionFeatures(features: SessionFeatures, parent: SessionFeatures): SessionFeatures {
  let memory = features.memory
  if (features.memory === 'off' || parent.memory === 'off')
    memory = 'off'
  else if (features.memory === 'read' || parent.memory === 'read')
    memory = 'read'
  return {
    speech: features.speech && parent.speech,
    reactions: features.reactions && parent.reactions,
    stickers: features.stickers && parent.stickers,
    cards: features.cards && parent.cards,
    skills: features.skills && parent.skills,
    tasks: features.tasks && parent.tasks,
    artistry: features.artistry && parent.artistry,
    memory,
    tools: features.tools.filter(group => parent.tools.includes(group)),
    screen: features.screen && parent.screen,
    modules: features.modules && parent.modules,
  }
}
