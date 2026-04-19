import type { RunState } from './state'
import type { ForegroundContext } from './types'

import { describe, expect, it } from 'vitest'

import {
  ADVISORY_CATEGORY_MAP,
  ADVISORY_SURFACE_MAP,
  buildRecoveryPlan,
  evaluateStrategy,
  summarizeAdvisories,
} from './strategy'

function createBaseState(overrides: Partial<RunState> = {}): RunState {
  return {
    pendingApprovalCount: 0,
    lastApprovalRejected: false,
    ptySessions: [],
    workflowStepTerminalBindings: [],
    ptyApprovalGrants: [],
    ptyAuditLog: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('evaluateStrategy', () => {
  it('should return proceed when no issues', () => {
    const state = createBaseState({
      displayInfo: { available: true, platform: 'darwin' },
    })
    const advisories = evaluateStrategy({
      proposedAction: { kind: 'screenshot', input: {} },
      state,
    })

    expect(advisories).toHaveLength(1)
    expect(advisories[0].kind).toBe('proceed')
  })

  it('should advise replan when last approval was rejected', () => {
    const state = createBaseState({
      lastApprovalRejected: true,
      lastRejectionReason: 'Too dangerous',
    })
    const advisories = evaluateStrategy({
      proposedAction: { kind: 'screenshot', input: {} },
      state,
    })

    expect(advisories.some(a => a.kind === 'approval_rejected_replan')).toBe(true)
  })

  it('should advise focus when wrong app is in foreground', () => {
    const state = createBaseState({
      activeTask: {
        id: '1',
        goal: 'Test',
        phase: 'executing',
        steps: [{ index: 1, stepId: 'step_1', label: 'Click in Terminal' }],
        currentStepIndex: 0,
        startedAt: new Date().toISOString(),
        failureCount: 0,
        maxConsecutiveFailures: 3,
      },
      foregroundContext: {
        available: true,
        appName: 'Finder',
        platform: 'darwin',
      },
    })
    const freshContext: ForegroundContext = {
      available: true,
      appName: 'Finder',
      platform: 'darwin',
    }
    const advisories = evaluateStrategy({
      proposedAction: { kind: 'click', input: { x: 100, y: 100 } },
      state,
      freshContext,
    })

    expect(advisories.some(a => a.kind === 'focus_app_first')).toBe(true)
  })

  it('should recognize VS Code aliases when inferring the target app', () => {
    const state = createBaseState({
      activeTask: {
        id: '1',
        goal: 'Workspace',
        phase: 'executing',
        steps: [{ index: 1, stepId: 'step_1', label: 'Focus VS Code' }],
        currentStepIndex: 0,
        startedAt: new Date().toISOString(),
        failureCount: 0,
        maxConsecutiveFailures: 3,
      },
      foregroundContext: {
        available: true,
        appName: 'Finder',
        platform: 'darwin',
      },
    })

    const advisories = evaluateStrategy({
      proposedAction: { kind: 'click', input: { x: 80, y: 120 } },
      state,
    })

    expect(advisories.some(a => a.kind === 'focus_app_first' && a.suggestedAction?.kind === 'focus_app')).toBe(true)
  })

  it('should advise screenshot first on tainted remote runner', () => {
    const state = createBaseState({
      executionTarget: {
        mode: 'remote',
        transport: 'ssh-stdio',
        hostName: 'test-host',
        isolated: false,
        tainted: true,
      },
    })
    const advisories = evaluateStrategy({
      proposedAction: { kind: 'click', input: { x: 100, y: 100 } },
      state,
    })

    expect(advisories.some(a => a.kind === 'take_screenshot_first')).toBe(true)
  })

  it('should advise read error when last terminal command failed', () => {
    const state = createBaseState({
      lastTerminalResult: {
        command: 'pnpm test',
        stdout: '',
        stderr: 'Error: tests failed',
        exitCode: 1,
        effectiveCwd: '/test',
        durationMs: 100,
        timedOut: false,
      },
    })
    const advisories = evaluateStrategy({
      proposedAction: { kind: 'terminal_exec', input: { command: 'pnpm test' } },
      state,
    })

    expect(advisories.some(a => a.kind === 'read_error_first')).toBe(true)
  })

  it('should advise abort when too many failures', () => {
    const state = createBaseState({
      activeTask: {
        id: '1',
        goal: 'Test',
        phase: 'executing',
        steps: [
          { index: 1, stepId: 'step_1', label: 'Step 1', outcome: 'failure', outcomeReason: 'err1' },
          { index: 2, stepId: 'step_2', label: 'Step 2', outcome: 'failure', outcomeReason: 'err2' },
          { index: 3, stepId: 'step_3', label: 'Step 3', outcome: 'failure', outcomeReason: 'err3' },
        ],
        currentStepIndex: 2,
        startedAt: new Date().toISOString(),
        failureCount: 3,
        maxConsecutiveFailures: 3,
      },
    })
    const advisories = evaluateStrategy({
      proposedAction: { kind: 'terminal_exec', input: { command: 'test' } },
      state,
    })

    expect(advisories.some(a => a.kind === 'abort_task')).toBe(true)
  })

  // -----------------------------------------------------------------------
  // Surface-routing rules
  // -----------------------------------------------------------------------

  it('should advise browser surface when UI action targets a browser', () => {
    const state = createBaseState({
      foregroundContext: {
        available: true,
        appName: 'Google Chrome',
        platform: 'darwin',
      },
      browserSurfaceAvailability: {
        executionMode: 'local-windowed',
        suitable: true,
        availableSurfaces: ['browser_cdp'],
        preferredSurface: 'browser_cdp',
        selectedToolName: 'browser_cdp_collect_elements',
        reason: 'CDP is connected.',
        extension: {
          enabled: true,
          connected: false,
        },
        cdp: {
          endpoint: 'http://localhost:9222',
          connected: true,
          connectable: true,
        },
      },
    })
    const advisories = evaluateStrategy({
      proposedAction: { kind: 'click', input: { x: 200, y: 300 } },
      state,
    })

    const adv = advisories.find(a => a.kind === 'use_browser_surface')
    expect(adv).toBeDefined()
    expect(adv!.suggestedToolName).toBe('browser_cdp_collect_elements')
  })

  it('should prefer browser extension surface when the extension bridge is connected', () => {
    const state = createBaseState({
      foregroundContext: {
        available: true,
        appName: 'Google Chrome',
        platform: 'darwin',
      },
      browserSurfaceAvailability: {
        executionMode: 'local-windowed',
        suitable: true,
        availableSurfaces: ['browser_dom', 'browser_cdp'],
        preferredSurface: 'browser_dom',
        selectedToolName: 'browser_dom_read_page',
        reason: 'Extension bridge is already connected.',
        extension: {
          enabled: true,
          connected: true,
        },
        cdp: {
          endpoint: 'http://localhost:9222',
          connected: true,
          connectable: true,
        },
      },
    })

    const advisories = evaluateStrategy({
      proposedAction: { kind: 'click', input: { x: 200, y: 300 } },
      state,
    })

    const adv = advisories.find(a => a.kind === 'use_browser_surface')
    expect(adv).toBeDefined()
    expect(adv!.suggestedToolName).toBe('browser_dom_read_page')
    expect(adv!.recommendedSurface).toBe('browser_dom')
  })

  it('should not reroute to browser surface when the execution target is remote', () => {
    const state = createBaseState({
      foregroundContext: {
        available: true,
        appName: 'Google Chrome',
        platform: 'darwin',
      },
      executionTarget: {
        mode: 'remote',
        transport: 'ssh-stdio',
        hostName: 'remote-browser-host',
        isolated: false,
        tainted: false,
      },
      browserSurfaceAvailability: {
        executionMode: 'remote',
        suitable: false,
        availableSurfaces: [],
        reason: 'Browser surfaces are not suitable for remote desktop.',
        extension: {
          enabled: true,
          connected: true,
        },
        cdp: {
          endpoint: 'http://localhost:9222',
          connected: true,
          connectable: true,
        },
      },
    })

    const advisories = evaluateStrategy({
      proposedAction: { kind: 'click', input: { x: 200, y: 300 } },
      state,
    })

    expect(advisories.some(a => a.kind === 'use_browser_surface')).toBe(false)
  })

  it('should advise browser surface for various browser names', () => {
    for (const browser of ['Firefox', 'Safari', 'Arc', 'Brave Browser', 'Microsoft Edge']) {
      const state = createBaseState({
        foregroundContext: { available: true, appName: browser, platform: 'darwin' },
      })
      const advisories = evaluateStrategy({
        proposedAction: { kind: 'type_text', input: { text: 'hello' } },
        state,
      })
      expect(advisories.some(a => a.kind === 'use_browser_surface'), `expected browser surface for ${browser}`).toBe(true)
    }
  })

  it('should advise accessibility grounding on macOS for non-browser screenshot', () => {
    const state = createBaseState({
      foregroundContext: {
        available: true,
        appName: 'Finder',
        platform: 'darwin',
      },
    })
    const advisories = evaluateStrategy({
      proposedAction: { kind: 'screenshot', input: {} },
      state,
    })

    const adv = advisories.find(a => a.kind === 'use_accessibility_grounding')
    expect(adv).toBeDefined()
    expect(adv!.suggestedToolName).toBe('accessibility_snapshot')
  })

  it('should NOT advise accessibility grounding when foreground is a browser', () => {
    const state = createBaseState({
      foregroundContext: {
        available: true,
        appName: 'Google Chrome',
        platform: 'darwin',
      },
    })
    const advisories = evaluateStrategy({
      proposedAction: { kind: 'screenshot', input: {} },
      state,
    })

    expect(advisories.some(a => a.kind === 'use_accessibility_grounding')).toBe(false)
  })

  it('should advise PTY surface when terminal_exec targets a TUI session', () => {
    const state = createBaseState({
      foregroundContext: {
        available: true,
        appName: 'Terminal',
        windowTitle: 'vim — ~/project/main.ts',
        platform: 'darwin',
      },
      ptySessions: [
        {
          id: 'pty_1',
          alive: true,
          rows: 24,
          cols: 80,
          pid: 4242,
          createdAt: new Date().toISOString(),
        },
      ],
      activePtySessionId: 'pty_1',
    })
    const advisories = evaluateStrategy({
      proposedAction: { kind: 'terminal_exec', input: { command: ':wq' } },
      state,
    })

    const adv = advisories.find(a => a.kind === 'use_pty_surface')
    expect(adv).toBeDefined()
    expect(adv!.suggestedToolName).toBe('pty_read_screen')
  })

  it('should NOT advise PTY when terminal is not running a TUI', () => {
    const state = createBaseState({
      foregroundContext: {
        available: true,
        appName: 'Terminal',
        windowTitle: 'zsh — ~/project',
        platform: 'darwin',
      },
    })
    const advisories = evaluateStrategy({
      proposedAction: { kind: 'terminal_exec', input: { command: 'ls' } },
      state,
    })

    expect(advisories.some(a => a.kind === 'use_pty_surface')).toBe(false)
  })

  it('should advise display enumeration when displayInfo is missing', () => {
    const state = createBaseState({ displayInfo: undefined })
    const advisories = evaluateStrategy({
      proposedAction: { kind: 'screenshot', input: {} },
      state,
    })

    const adv = advisories.find(a => a.kind === 'enumerate_displays_first')
    expect(adv).toBeDefined()
    expect(adv!.suggestedToolName).toBe('display_enumerate')
  })

  it('should NOT advise display enumeration when displayInfo exists', () => {
    const state = createBaseState({
      displayInfo: {
        available: true,
        platform: 'darwin',
        logicalWidth: 1920,
        logicalHeight: 1080,
      },
    })
    const advisories = evaluateStrategy({
      proposedAction: { kind: 'screenshot', input: {} },
      state,
    })

    expect(advisories.some(a => a.kind === 'enumerate_displays_first')).toBe(false)
  })

  it('should emit multiple surface advisories when applicable', () => {
    // macOS + non-browser + screenshot + no displayInfo → accessibility + display
    const state = createBaseState({
      foregroundContext: {
        available: true,
        appName: 'Cursor',
        platform: 'darwin',
      },
      displayInfo: undefined,
    })
    const advisories = evaluateStrategy({
      proposedAction: { kind: 'screenshot', input: {} },
      state,
    })

    expect(advisories.some(a => a.kind === 'use_accessibility_grounding')).toBe(true)
    expect(advisories.some(a => a.kind === 'enumerate_displays_first')).toBe(true)
    expect(advisories.some(a => a.kind === 'proceed')).toBe(false)
  })
})

describe('buildRecoveryPlan', () => {
  it('should suggest wait_and_retry on timeout', () => {
    const result = buildRecoveryPlan({
      failedAction: { kind: 'terminal_exec', input: { command: 'slow-cmd' } },
      errorMessage: 'process timeout after 30000ms',
      state: createBaseState(),
    })

    expect(result.kind).toBe('wait_and_retry')
  })

  it('should suggest read_error_first on terminal failure', () => {
    const result = buildRecoveryPlan({
      failedAction: { kind: 'terminal_exec', input: { command: 'bad-cmd' } },
      errorMessage: 'command not found',
      state: createBaseState({
        lastTerminalResult: {
          command: 'bad-cmd',
          stdout: '',
          stderr: 'command not found: bad-cmd',
          exitCode: 127,
          effectiveCwd: '/test',
          durationMs: 10,
          timedOut: false,
        },
      }),
    })

    expect(result.kind).toBe('read_error_first')
    expect(result.evidence).toBeDefined()
    expect(result.evidence!.length).toBeGreaterThan(0)
  })

  it('should suggest screenshot on generic UI failure', () => {
    const result = buildRecoveryPlan({
      failedAction: { kind: 'click', input: { x: 100, y: 100 } },
      errorMessage: 'click failed',
      state: createBaseState(),
    })

    expect(result.kind).toBe('take_screenshot_first')
    expect(result.suggestedAction?.kind).toBe('screenshot')
  })

  // -----------------------------------------------------------------------
  // Surface-aware recovery branches
  // -----------------------------------------------------------------------

  it('should suggest PTY when terminal_exec fails in a TUI session', () => {
    const result = buildRecoveryPlan({
      failedAction: { kind: 'terminal_exec', input: { command: ':wq' } },
      errorMessage: 'command not found: :wq',
      state: createBaseState({
        foregroundContext: {
          available: true,
          appName: 'iTerm2',
          platform: 'darwin',
        },
        activeWindowTitle: 'nvim — main.ts',
        ptySessions: [
          {
            id: 'pty_1',
            alive: true,
            rows: 24,
            cols: 80,
            pid: 4242,
            createdAt: new Date().toISOString(),
          },
        ],
        activePtySessionId: 'pty_1',
      }),
    })

    expect(result.kind).toBe('use_pty_surface')
    expect(result.suggestedToolName).toBe('pty_read_screen')
  })

  it('should suggest browser surface when UI action fails in a browser', () => {
    const result = buildRecoveryPlan({
      failedAction: { kind: 'click', input: { x: 400, y: 300 } },
      errorMessage: 'element not found at coordinates',
      state: createBaseState({
        foregroundContext: {
          available: true,
          appName: 'Google Chrome',
          platform: 'darwin',
        },
        browserSurfaceAvailability: {
          executionMode: 'local-windowed',
          suitable: true,
          availableSurfaces: ['browser_dom'],
          preferredSurface: 'browser_dom',
          selectedToolName: 'browser_dom_read_page',
          reason: 'Extension bridge is already connected.',
          extension: {
            enabled: true,
            connected: true,
          },
          cdp: {
            endpoint: 'http://localhost:9222',
            connected: false,
            connectable: false,
            lastError: 'connection refused',
          },
        },
      }),
    })

    expect(result.kind).toBe('use_browser_surface')
    expect(result.suggestedToolName).toBe('browser_dom_read_page')
  })

  it('should not fall back to CDP in recovery when browser surfaces are unsuitable', () => {
    const result = buildRecoveryPlan({
      failedAction: { kind: 'click', input: { x: 400, y: 300 } },
      errorMessage: 'element not found at coordinates',
      state: createBaseState({
        foregroundContext: {
          available: true,
          appName: 'Google Chrome',
          platform: 'darwin',
        },
        executionTarget: {
          mode: 'remote',
          transport: 'ssh-stdio',
          hostName: 'remote-browser-host',
          isolated: false,
          tainted: false,
        },
        browserSurfaceAvailability: {
          executionMode: 'remote',
          suitable: false,
          availableSurfaces: [],
          reason: 'Browser surfaces are not suitable for remote desktop.',
          extension: {
            enabled: true,
            connected: true,
          },
          cdp: {
            endpoint: 'http://localhost:9222',
            connected: true,
            connectable: true,
          },
        },
      }),
    })

    expect(result.kind).toBe('take_screenshot_first')
    expect(result.suggestedToolName).toBeUndefined()
  })

  it('should suggest accessibility when observation fails on macOS', () => {
    const result = buildRecoveryPlan({
      failedAction: { kind: 'screenshot', input: {} },
      errorMessage: 'screen recording permission denied',
      state: createBaseState({
        foregroundContext: {
          available: true,
          appName: 'Finder',
          platform: 'darwin',
        },
      }),
    })

    expect(result.kind).toBe('use_accessibility_grounding')
    expect(result.suggestedToolName).toBe('accessibility_snapshot')
  })

  it('should fall through to generic screenshot for non-macOS observation failure', () => {
    const result = buildRecoveryPlan({
      failedAction: { kind: 'screenshot', input: {} },
      errorMessage: 'display capture failed',
      state: createBaseState({
        foregroundContext: {
          available: true,
          appName: 'Files',
          platform: 'linux',
        },
      }),
    })

    expect(result.kind).toBe('take_screenshot_first')
  })
})

describe('summarizeAdvisories', () => {
  it('should return empty string for proceed-only', () => {
    const result = summarizeAdvisories([{
      kind: 'proceed',
      reason: 'ok',
      category: 'informational',
      recommendedSurface: 'none',
    }])
    expect(result).toBe('')
  })

  it('should format advisory summary with category and surface', () => {
    const result = summarizeAdvisories([
      {
        kind: 'focus_app_first',
        reason: 'Wrong app',
        category: 'prep',
        recommendedSurface: 'desktop',
      },
      {
        kind: 'read_error_first',
        reason: 'Error exists',
        category: 'recovery',
        recommendedSurface: 'terminal',
      },
    ])
    expect(result).toContain('[prep/focus_app_first')
    expect(result).toContain('→ desktop')
    expect(result).toContain('[recovery/read_error_first')
    expect(result).toContain('→ terminal')
  })

  it('should omit surface arrow for none surface', () => {
    const result = summarizeAdvisories([{
      kind: 'abort_task',
      reason: 'Too many failures',
      category: 'recovery',
      recommendedSurface: 'none',
    }])
    expect(result).toContain('[recovery/abort_task]')
    expect(result).not.toContain('→')
  })
})

// ---------------------------------------------------------------------------
// Category and surface map consistency
// ---------------------------------------------------------------------------

describe('advisory maps', () => {
  it('all advisories should have category and recommendedSurface populated', () => {
    const state = createBaseState({
      foregroundContext: {
        available: true,
        appName: 'Finder',
        platform: 'darwin',
      },
      displayInfo: undefined,
    })
    const advisories = evaluateStrategy({
      proposedAction: { kind: 'screenshot', input: {} },
      state,
    })

    for (const adv of advisories) {
      expect(adv.category).toBeDefined()
      expect(adv.recommendedSurface).toBeDefined()
      expect(ADVISORY_CATEGORY_MAP[adv.kind]).toBe(adv.category)
      expect(ADVISORY_SURFACE_MAP[adv.kind]).toBe(adv.recommendedSurface)
    }
  })

  it('buildRecoveryPlan should return advisory with category and surface', () => {
    const result = buildRecoveryPlan({
      failedAction: { kind: 'click', input: { x: 100, y: 100 } },
      errorMessage: 'click failed',
      state: createBaseState(),
    })
    expect(result.category).toBe('prep')
    expect(result.recommendedSurface).toBe('desktop')
  })

  it('advisory category map should classify reroute kinds correctly', () => {
    expect(ADVISORY_CATEGORY_MAP.use_browser_surface).toBe('reroute')
    expect(ADVISORY_CATEGORY_MAP.use_accessibility_grounding).toBe('reroute')
    expect(ADVISORY_CATEGORY_MAP.use_terminal_instead).toBe('reroute')
  })

  it('advisory category map should classify PTY surface as reroute', () => {
    expect(ADVISORY_CATEGORY_MAP.use_pty_surface).toBe('reroute')
  })

  it('advisory surface map should point to correct surfaces', () => {
    expect(ADVISORY_SURFACE_MAP.enumerate_displays_first).toBe('display')
    expect(ADVISORY_SURFACE_MAP.use_browser_surface).toBe('browser_cdp')
    expect(ADVISORY_SURFACE_MAP.use_accessibility_grounding).toBe('accessibility')
    expect(ADVISORY_SURFACE_MAP.use_pty_surface).toBe('pty')
    expect(ADVISORY_SURFACE_MAP.proceed).toBe('none')
  })
})
