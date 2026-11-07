import type { SessionFeatureOverrides, SessionFeatures } from '@proj-airi/core-agent'

/** Conversation controls expose user decisions rather than the complete runtime policy. */
export const SESSION_FEATURE_GROUPS = [
  { id: 'behavior', features: ['reactions', 'stickers', 'skills', 'memory', 'tasks'] },
  { id: 'tools', features: ['tools.web-search', 'tools.mcp', 'tools.plugins', 'tools.home-assistant', 'screen'] },
] as const

export type SessionFeatureSetting = typeof SESSION_FEATURE_GROUPS[number]['features'][number]

/** Maps the simple memory switch to runtime policy. Read-only access remains an adapter option. */
export function sessionFeatureValue(features: SessionFeatures, key: SessionFeatureSetting): boolean {
  switch (key) {
    case 'memory': return features.memory !== 'off'
    case 'tools.web-search': return features.tools.includes('web-search')
    case 'tools.mcp': return features.tools.includes('mcp')
    case 'tools.plugins': return features.tools.includes('plugins')
    case 'tools.home-assistant': return features.tools.includes('home-assistant')
    default: return features[key]
  }
}

/** Builds one explicit conversation choice without fixing any unrelated tool sources. */
export function sessionFeatureChange(key: SessionFeatureSetting, enabled: boolean): SessionFeatureOverrides {
  switch (key) {
    case 'memory': return { memory: enabled ? 'write' : 'off' }
    case 'tools.web-search': return { tools: { 'web-search': enabled } }
    case 'tools.mcp': return { tools: { mcp: enabled } }
    case 'tools.plugins': return { tools: { plugins: enabled } }
    case 'tools.home-assistant': return { tools: { 'home-assistant': enabled } }
    default: return { [key]: enabled }
  }
}
