import type { MediaAccessPermissionRequest, PermissionCheckHandlerHandlerDetails, WebContents } from 'electron'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { shouldGrantAudioCapturePermission, shouldGrantElectronPermission } from './media-permissions'

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
})
