import type { RouteTargetExpression } from '@proj-airi/server-shared/types'

import type { AuthenticatedPeer } from '../../types'

function globToRegExp(glob: string) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&')

  const pattern = `^${escaped.replace(/\*/g, '.*')}$`
  return new RegExp(pattern)
}

function matchesGlob(glob: string, value?: string) {
  if (!value) {
    return false
  }

  return globToRegExp(glob).test(value)
}

export function matchesLabelSelector(selector: string, labels: Record<string, string>) {
  const [rawKey, rawValue] = selector.split('=', 2)
  const key = rawKey?.trim()
  const value = rawValue?.trim()

  if (!key) {
    return false
  }

  if (typeof value === 'undefined') {
    return key in labels
  }

  return labels[key] === value
}

export function matchesLabelSelectors(selectors: string[], labels: Record<string, string>) {
  return selectors.every(selector => matchesLabelSelector(selector, labels))
}

function getPeerLabels(peer: AuthenticatedPeer) {
  return {
    ...peer.extensionIdentity?.labels,
    ...peer.identity?.extension.labels,
    ...peer.identity?.labels,
  }
}

function getPeerExtensionId(peer: AuthenticatedPeer) {
  return peer.identity?.extension.id ?? peer.extensionIdentity?.id
}

function matchesExtensionModule(peer: AuthenticatedPeer, moduleName: string) {
  return [...peer.extensionModules?.values() ?? []]
    .some(module => module.name === moduleName || module.identity.id === moduleName)
}

function matchesExtensionModuleGlob(peer: AuthenticatedPeer, glob: string) {
  return [...peer.extensionModules?.values() ?? []]
    .some(module => matchesGlob(glob, module.name) || matchesGlob(glob, module.identity.id))
}

function matchesPeerId(peer: AuthenticatedPeer, peerId: string) {
  return peer.peer.id === peerId || Boolean(peer.peerIds?.has(peerId))
}

export function matchesRouteExpression(expression: RouteTargetExpression, peer: AuthenticatedPeer): boolean {
  switch (expression.type) {
    case 'and':
      return expression.all.every(expr => matchesRouteExpression(expr, peer))
    case 'or':
      return expression.any.some(expr => matchesRouteExpression(expr, peer))
    case 'glob': {
      const extensionId = getPeerExtensionId(peer)
      const matched = matchesGlob(expression.glob, peer.name)
        || matchesGlob(expression.glob, extensionId)
        || matchesGlob(expression.glob, peer.identity?.id)

      return expression.inverted ? !matched : matched
    }
    case 'ids': {
      const matched = expression.ids.some(peerId => matchesPeerId(peer, peerId))
      return expression.inverted ? !matched : matched
    }
    case 'plugin': {
      const matched = expression.plugins.includes(getPeerExtensionId(peer) ?? '')
      return expression.inverted ? !matched : matched
    }
    case 'instance': {
      const matched = expression.instances.includes(peer.identity?.id ?? '')
      return expression.inverted ? !matched : matched
    }
    case 'label': {
      const matched = matchesLabelSelectors(expression.selectors, getPeerLabels(peer))
      return expression.inverted ? !matched : matched
    }
    case 'module': {
      const matched = expression.modules.some(module => peer.name === module || matchesExtensionModule(peer, module))
      return expression.inverted ? !matched : matched
    }
    case 'source': {
      const matched = expression.sources.includes(peer.name)
      return expression.inverted ? !matched : matched
    }
    default:
      return false
  }
}

export function matchesDestination(destination: string | RouteTargetExpression, peer: AuthenticatedPeer) {
  if (typeof destination !== 'string') {
    return matchesRouteExpression(destination, peer)
  }

  if (destination === '*') {
    return true
  }

  const [prefix, rawValue] = destination.split(':', 2)
  const value = rawValue ?? ''

  switch (prefix) {
    case 'plugin':
      return getPeerExtensionId(peer) === value
    case 'instance':
      return peer.identity?.id === value
    case 'label':
      return matchesLabelSelectors([value], getPeerLabels(peer))
    case 'peer':
      return matchesPeerId(peer, value)
    case 'module':
      return peer.name === value || matchesExtensionModule(peer, value)
    case 'source':
      return peer.name === value
    default: {
      const extensionId = getPeerExtensionId(peer)
      // REVIEW: Bare/glob destination matching is kept for existing event payloads that do not use module:<name>.
      return matchesGlob(destination, peer.name)
        || matchesGlob(destination, extensionId)
        || matchesGlob(destination, peer.identity?.id)
        || matchesExtensionModuleGlob(peer, destination)
    }
  }
}

export function matchesDestinations(destinations: Array<string | RouteTargetExpression>, peer: AuthenticatedPeer) {
  return destinations.some(destination => matchesDestination(destination, peer))
}
