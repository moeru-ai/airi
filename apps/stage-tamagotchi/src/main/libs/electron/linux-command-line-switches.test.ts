import { describe, expect, it } from 'vitest'

import { isWaylandSession, resolveLinuxCommandLineSwitches } from './linux-command-line-switches'

describe('isWaylandSession', () => {
  it('is false when XDG_SESSION_TYPE is unset', () => {
    expect(isWaylandSession({})).toBe(false)
  })

  it('is false for an X11 session', () => {
    expect(isWaylandSession({ XDG_SESSION_TYPE: 'x11' })).toBe(false)
  })

  it('is true only for an exact "wayland" session type', () => {
    expect(isWaylandSession({ XDG_SESSION_TYPE: 'wayland' })).toBe(true)
    expect(isWaylandSession({ XDG_SESSION_TYPE: 'Wayland' })).toBe(false)
  })
})

describe('resolveLinuxCommandLineSwitches', () => {
  it('always includes the WebGPU/Vulkan switches', () => {
    const names = resolveLinuxCommandLineSwitches({}).map(s => `${s.name}=${s.value}`)

    expect(names).toContain('enable-features=SharedArrayBuffer')
    expect(names).toContain('enable-unsafe-webgpu=')
    expect(names).toContain('enable-features=Vulkan')
  })

  it('does not add Ozone/Wayland switches outside a Wayland session', () => {
    const switches = resolveLinuxCommandLineSwitches({ XDG_SESSION_TYPE: 'x11' })

    expect(switches.some(s => s.value === 'UseOzonePlatform')).toBe(false)
    expect(switches.some(s => s.value === 'WaylandWindowDecorations')).toBe(false)
    expect(switches.some(s => s.value === 'GlobalShortcutsPortal')).toBe(false)
  })

  it('adds Ozone/Wayland switches under a Wayland session', () => {
    const switches = resolveLinuxCommandLineSwitches({ XDG_SESSION_TYPE: 'wayland' })
    const values = switches.map(s => s.value)

    expect(values).toContain('GlobalShortcutsPortal')
    expect(values).toContain('UseOzonePlatform')
    expect(values).toContain('WaylandWindowDecorations')
  })

  it('never drops the base switches when Wayland switches are added', () => {
    const switches = resolveLinuxCommandLineSwitches({ XDG_SESSION_TYPE: 'wayland' })

    expect(switches.filter(s => s.value === 'Vulkan')).toHaveLength(1)
  })
})
