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
  const [key, value] = selector.split('=', 2)
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

export function matchesRouteExpression(expression: RouteTargetExpression, peer: AuthenticatedPeer) {
  switch (expression.type) {
    case 'and':
      return expression.all.every(expr => matchesRouteExpression(expr, peer))
    case 'or':
      return expression.any.some(expr => matchesRouteExpression(expr, peer))
    case 'glob': {
      const matched = matchesGlob(expression.glob, peer.name)
        || matchesGlob(expression.glob, peer.identity?.plugin)
        || matchesGlob(expression.glob, peer.identity?.instanceId)

      return expression.inverted ? !matched : matched
    }
    case 'ids': {
      const matched = expression.ids.includes(peer.peer.id)
      return expression.inverted ? !matched : matched
    }
    case 'plugin': {
      const matched = expression.plugins.includes(peer.identity?.plugin ?? '')
      return expression.inverted ? !matched : matched
    }
    case 'instance': {
      const matched = expression.instances.includes(peer.identity?.instanceId ?? '')
      return expression.inverted ? !matched : matched
    }
    case 'label': {
      const matched = matchesLabelSelectors(expression.selectors, peer.identity?.labels ?? {})
      return expression.inverted ? !matched : matched
    }
    case 'module': {
      const matched = expression.modules.includes(peer.name)
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
      return peer.identity?.plugin === value
    case 'instance':
      return peer.identity?.instanceId === value
    case 'label':
      return matchesLabelSelectors([value], peer.identity?.labels ?? {})
    case 'peer':
      return peer.peer.id === value
    case 'module':
      return peer.name === value
    case 'source':
      return peer.name === value
    default:
      return matchesGlob(destination, peer.name)
        || matchesGlob(destination, peer.identity?.plugin)
        || matchesGlob(destination, peer.identity?.instanceId)
  }
}

export function matchesDestinations(destinations: Array<string | RouteTargetExpression>, peer: AuthenticatedPeer) {
  return destinations.some(destination => matchesDestination(destination, peer))
}
