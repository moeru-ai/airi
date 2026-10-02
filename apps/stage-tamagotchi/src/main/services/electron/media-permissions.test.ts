import type { DevicePermissionHandlerHandlerDetails, HIDDevice, MediaAccessPermissionRequest, PermissionCheckHandlerHandlerDetails, Session, WebContents } from 'electron'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setupPermissionHandlers, shouldGrantAudioCapturePermission, shouldGrantElectronPermission } from './media-permissions'

const localWebContents = {
  getURL: () => 'file:///app/index.html',
} satisfies Pick<WebContents, 'getURL'>

/**
 * Creates official Electron request details for media permission tests.
 */
function createMediaRequestDetails(overrides: Partial<MediaAccessPermissionRequest> = {}): MediaAccessPermissionRequest {
  return {
    isMainFrame: true,
    requestingUrl: 'file:///app/index.html',
    ...overrides,
  }
}

/**
 * Creates official Electron check details for media permission tests.
 */
function createPermissionCheckDetails(overrides: Partial<PermissionCheckHandlerHandlerDetails> = {}): PermissionCheckHandlerHandlerDetails {
  return {
    isMainFrame: true,
    ...overrides,
  }
}

function createHIDPermissionDetails(overrides: Partial<DevicePermissionHandlerHandlerDetails> = {}): DevicePermissionHandlerHandlerDetails {
  const device: HIDDevice = {
    collections: [{
      children: [],
      featureReports: [],
      inputReports: [],
      outputReports: [],
      type: 1,
      usage: 0x05,
      usagePage: 0x01,
    }],
    deviceId: 'dualsense-1',
    name: 'DualSense Wireless Controller',
    productId: 0x0CE6,
    vendorId: 0x054C,
  }

  return {
    device,
    deviceType: 'hid',
    origin: 'file://',
    ...overrides,
  }
}

/**
 * @example
 * shouldGrantElectronPermission(localWebContents, 'media', origin, details)
 */
describe('media permissions', () => {
  beforeEach(() => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  /** @example Local packaged pages may request audio-only media. */
  it('grants local audio media permission requests', () => {
    expect(shouldGrantAudioCapturePermission(
      localWebContents,
      'media',
      undefined,
      createMediaRequestDetails({ mediaTypes: ['audio'] }),
    )).toBe(true)
  })

  /** @example Camera-only requests remain denied. */
  it('rejects video-only media permission requests', () => {
    expect(shouldGrantAudioCapturePermission(
      localWebContents,
      'media',
      undefined,
      createMediaRequestDetails({ mediaTypes: ['video'] }),
    )).toBe(false)
  })

  /** @example Combined microphone and camera requests remain denied. */
  it('rejects media permission requests that include video', () => {
    expect(shouldGrantAudioCapturePermission(
      localWebContents,
      'media',
      undefined,
      createMediaRequestDetails({ mediaTypes: ['audio', 'video'] }),
    )).toBe(false)
  })

  /** @example A generic media request without a declared audio type is not inferred as safe. */
  it('does not treat missing media details as audio', () => {
    expect(shouldGrantAudioCapturePermission(
      localWebContents,
      'media',
      undefined,
      createMediaRequestDetails(),
    )).toBe(false)
  })

  /** @example Electron permission checks report audio through mediaType. */
  it('grants local audio permission checks', () => {
    expect(shouldGrantAudioCapturePermission(
      null,
      'media',
      'file:///app/index.html',
      createPermissionCheckDetails({ mediaType: 'audio' }),
    )).toBe(true)
  })

  /** @example A remote top-level origin cannot request the microphone. */
  it('rejects audio requests from non-local origins', () => {
    expect(shouldGrantAudioCapturePermission(
      null,
      'media',
      'https://example.com',
      createPermissionCheckDetails({ mediaType: 'audio' }),
    )).toBe(false)
  })

  /** @example A remote requesting frame is rejected even inside a local BrowserWindow. */
  it('rejects remote frame requests even when the host window is local', () => {
    expect(shouldGrantAudioCapturePermission(
      localWebContents,
      'media',
      undefined,
      createMediaRequestDetails({ mediaTypes: ['audio'], requestingUrl: 'https://example.com/frame.html' }),
    )).toBe(false)
  })

  /** @example A local child frame embedded by a remote page is not AIRI-owned. */
  it('rejects local frames embedded by a remote origin', () => {
    expect(shouldGrantAudioCapturePermission(
      null,
      'media',
      'http://localhost:5173',
      createPermissionCheckDetails({
        embeddingOrigin: 'https://example.com',
        mediaType: 'audio',
        securityOrigin: 'http://localhost:5173',
      }),
    )).toBe(false)
  })

  /** @example All explicit requester identities are accepted when they remain local. */
  it('grants audio requests with explicit local requester URLs', () => {
    expect(shouldGrantAudioCapturePermission(
      null,
      'media',
      'http://localhost:5173',
      createPermissionCheckDetails({
        mediaType: 'audio',
        requestingUrl: 'http://localhost:5173',
        securityOrigin: 'http://localhost:5173',
      }),
    )).toBe(true)
  })

  /** @example Extension assets served from AIRI's loopback server remain untrusted. */
  it('rejects plugin asset frames served from a loopback origin', () => {
    // ROOT CAUSE:
    //
    // Treating every loopback HTTP origin as AIRI-owned also trusts extension UI frames.
    // Those frames use the same loopback transport but do not share the renderer origin.
    // We fixed this by matching HTTP origins against ELECTRON_RENDERER_URL exactly.
    expect(shouldGrantAudioCapturePermission(
      null,
      'media',
      'http://127.0.0.1:48123',
      createPermissionCheckDetails({
        mediaType: 'audio',
        requestingUrl: 'http://127.0.0.1:48123/_airi/extensions/example/sessions/session/ui/index.html',
        securityOrigin: 'http://127.0.0.1:48123',
      }),
    )).toBe(false)
  })

  /** @example A plugin development server cannot inherit AIRI renderer permissions. */
  it('rejects plugin frames served from another localhost port', () => {
    expect(shouldGrantAudioCapturePermission(
      null,
      'media',
      'http://localhost:4173',
      createPermissionCheckDetails({
        mediaType: 'audio',
        requestingUrl: 'http://localhost:4173/index.html',
        securityOrigin: 'http://localhost:4173',
      }),
    )).toBe(false)
  })

  /** @example Chromium's opaque origin does not override an explicit packaged file URL. */
  it('ignores opaque file origins when packaged local pages request audio', () => {
    expect(shouldGrantAudioCapturePermission(
      localWebContents,
      'media',
      'null',
      createMediaRequestDetails({ mediaTypes: ['audio'] }),
    )).toBe(true)
  })

  /** @example Local AIRI pages retain screen-capture access. */
  it('grants display capture requests from local app pages', () => {
    expect(shouldGrantElectronPermission(
      localWebContents,
      'display-capture',
      undefined,
      createMediaRequestDetails(),
    )).toBe(true)
  })

  /** @example Remote frames cannot invoke screen capture through the global session handler. */
  it('rejects display capture requests from remote pages', () => {
    expect(shouldGrantElectronPermission(
      localWebContents,
      'display-capture',
      undefined,
      createMediaRequestDetails({ requestingUrl: 'https://example.com/capture.html' }),
    )).toBe(false)
  })

  // https://github.com/moeru-ai/airi/issues/2177
  it('grants screen capture requests reported as media from local app pages (Issue #2177)', () => {
    // ROOT CAUSE:
    //
    // `navigator.mediaDevices.getDisplayMedia()` reaches `setPermissionRequestHandler` as the `media`
    // permission, and Electron only appends `audio` or `video` to `mediaTypes` for device capture, so a
    // desktop capture request arrives with an empty `mediaTypes` list.
    //
    // `shouldGrantElectronPermission` returned early for every `media` operation and demanded audio-only
    // details, so screen capture was denied before the allowlisted `display-capture` entry was reached:
    //
    // if (permission === 'media')
    //   return shouldGrantAudioCapturePermission(webContents, permission, requestingOrigin, details)
    //
    // We fixed this by resolving a `media` operation without device media types to `display-capture`, so
    // the existing allowlist and local-frame checks decide the outcome.
    expect(shouldGrantElectronPermission(
      localWebContents,
      'media',
      undefined,
      createMediaRequestDetails({ mediaTypes: [], securityOrigin: 'file:///app/index.html' }),
      () => true,
    )).toBe(true)
  })

  it('rejects screen capture requests reported as media from remote pages', () => {
    expect(shouldGrantElectronPermission(
      localWebContents,
      'media',
      undefined,
      createMediaRequestDetails({
        mediaTypes: [],
        requestingUrl: 'https://example.com/capture.html',
        securityOrigin: 'https://example.com',
      }),
      () => true,
    )).toBe(false)
  })

  // https://github.com/moeru-ai/airi/pull/2178#discussion_r3681573150
  it('rejects desktop capture that no renderer asked for', () => {
    // ROOT CAUSE:
    //
    // Electron reports the legacy `chromeMediaSource: 'desktop'` constraint with the same empty
    // `mediaTypes` list as `getDisplayMedia()`, but serves it from `HandleUserMediaRequest` instead of
    // `setDisplayMediaRequestHandler`. Granting on empty `mediaTypes` alone therefore also handed a local
    // page the full desktop through `getUserMedia()`, skipping AIRI's own source selection:
    //
    // const allowlistPermission = isDisplayCaptureMediaPermission(permission, details) ? 'display-capture' : permission
    //
    // We fixed this by additionally requiring an authorized capture source, which only AIRI's selected
    // source flow installs.
    expect(shouldGrantElectronPermission(
      localWebContents,
      'media',
      undefined,
      createMediaRequestDetails({ mediaTypes: [], securityOrigin: 'file:///app/index.html' }),
      () => false,
    )).toBe(false)
  })

  it('denies desktop capture when no authorization callback is supplied', () => {
    expect(shouldGrantElectronPermission(
      localWebContents,
      'media',
      undefined,
      createMediaRequestDetails({ mediaTypes: [], securityOrigin: 'file:///app/index.html' }),
    )).toBe(false)
  })

  it('keeps camera requests denied now that screen capture shares the media permission', () => {
    expect(shouldGrantElectronPermission(
      localWebContents,
      'media',
      undefined,
      createMediaRequestDetails({ mediaTypes: ['video'], securityOrigin: 'file:///app/index.html' }),
      () => true,
    )).toBe(false)
  })

  /** @example Local AIRI pages retain sanitized clipboard writes used by chat copy actions. */
  it('grants sanitized clipboard writes from local app pages', () => {
    expect(shouldGrantElectronPermission(
      localWebContents,
      'clipboard-sanitized-write',
      'file:///app/index.html',
      createPermissionCheckDetails(),
    )).toBe(true)
  })

  /** @example Unreviewed permission categories are denied by default. */
  it('rejects unrelated permissions instead of granting all local requests', () => {
    expect(shouldGrantElectronPermission(
      localWebContents,
      'notifications',
      'file:///app/index.html',
      createPermissionCheckDetails(),
    )).toBe(false)
  })

  it('grants local AIRI pages access to HID devices through the device permission handler', () => {
    const targetSession = {
      setDevicePermissionHandler: vi.fn<Session['setDevicePermissionHandler']>(),
      setPermissionCheckHandler: vi.fn<Session['setPermissionCheckHandler']>(),
      setPermissionRequestHandler: vi.fn<Session['setPermissionRequestHandler']>(),
    }

    setupPermissionHandlers(targetSession, () => false)

    expect(targetSession.setDevicePermissionHandler).toHaveBeenCalledOnce()

    const handler = targetSession.setDevicePermissionHandler.mock.calls[0]?.[0]
    expect(handler).not.toBeNull()
    expect(handler?.(createHIDPermissionDetails())).toBe(true)
    expect(handler?.(createHIDPermissionDetails({ origin: 'https://example.com' }))).toBe(false)
    expect(handler?.(createHIDPermissionDetails({ deviceType: 'usb' }))).toBe(false)
  })

  it('allows HID permission checks only for local AIRI pages', () => {
    expect(shouldGrantElectronPermission(
      localWebContents,
      'hid',
      'file:///app/index.html',
      createPermissionCheckDetails(),
    )).toBe(true)
    expect(shouldGrantElectronPermission(
      localWebContents,
      'hid',
      'https://example.com',
      createPermissionCheckDetails(),
    )).toBe(false)
  })
})
