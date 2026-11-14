import type { DevicePermission, DevicePermissionKind } from '../../stores/device-permissions'
import type { DeviceSetupFeature, DeviceSetupPage, DeviceSetupPageKey } from './device-setup-pages'

import { describe, expect, it } from 'vitest'

import { orderDeviceSetupPages } from './device-setup-pages'

function permission(kind: DevicePermissionKind, id: string = kind): DevicePermission {
  return {
    id,
    kind,
    titleKey: `title.${kind}`,
    descriptionKey: `description.${kind}`,
    check: async () => 'not-determined',
    request: async () => {},
  }
}

function voiceprint(requires: readonly DeviceSetupPageKey[]): DeviceSetupFeature {
  return {
    key: 'voiceprint',
    requires,
    titleKey: 'title.voiceprint',
    icon: 'i-mingcute:voice-line',
    onKey: 'on.voiceprint',
    offKey: 'off.voiceprint',
    done: () => false,
  }
}

const ids = (pages: readonly DeviceSetupPage[]) => pages.map(page => page.id)

describe('orderDeviceSetupPages', () => {
  it('puts a feature page after the last page that it requires', () => {
    const pages = orderDeviceSetupPages(
      [permission('microphone'), permission('accessibility'), permission('screen-recording')],
      [voiceprint(['microphone'])],
    )

    expect(ids(pages)).toEqual(['microphone', 'voiceprint', 'accessibility', 'screen-recording'])
  })

  it('matches a requirement by the permission kind, not by the ID', () => {
    const pages = orderDeviceSetupPages(
      [permission('microphone'), permission('screen-recording', 'screen-share'), permission('push-to-talk')],
      [voiceprint(['screen-recording'])],
    )

    expect(ids(pages)).toEqual(['microphone', 'screen-share', 'voiceprint', 'push-to-talk'])
  })

  it('puts a feature page after all pages when the host has none of its required pages', () => {
    const pages = orderDeviceSetupPages([permission('notifications')], [voiceprint(['microphone'])])

    expect(ids(pages)).toEqual(['notifications', 'voiceprint'])
  })
})
