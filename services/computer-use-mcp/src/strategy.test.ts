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
    lastApprovalRejected: false,
    pendingApprovalCount: 0,
    ptyApprovalGrants: [],
    ptyAuditLog: [],
    ptySessions: [],
    updatedAt: new Date().toISOString(),
    workflowStepTerminalBindings: [],
    ...overrides,
  }
}

describe('evaluateStrategy', () => {
  it('should return proceed when no issues', () => {
    const state = createBaseState({
      displayInfo: { available: true, platform: 'darwin' },
    })
    const advisories = evaluateStrategy({
      proposedAction: { input: {}, kind: 'screenshot' },
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
      proposedAction: { input: {}, kind: 'screenshot' },
      state,
    })

    expect(advisories.some(a => a.kind === 'approval_rejected_replan')).toBe(true)
  })

  it('should advise focus when wrong app is in foreground', () => {
    const state = createBaseState({
      activeTask: {
        currentStepIndex: 0,
        failureCount: 0,
        goal: 'Test',
        id: '1',
        maxConsecutiveFailures: 3,
        phase: 'executing',
        startedAt: new Date().toISOString(),
        steps: [{ index: 1, label: 'Click in Terminal', stepId: 'step_1' }],
      },
      foregroundContext: {
        appName: 'Finder',
        available: true,
        platform: 'darwin',
      },
    })
    const freshContext: ForegroundContext = {
      appName: 'Finder',
      available: true,
      platform: 'darwin',
    }
    const advisories = evaluateStrategy({
      freshContext,
      proposedAction: { input: { x: 100, y: 100 }, kind: 'click' },
      state,
    })

    expect(advisories.some(a => a.kind === 'focus_app_first')).toBe(true)
  })

  it('should recognize VS Code aliases when inferring the target app', () => {
    const state = createBaseState({
      activeTask: {
        currentStepIndex: 0,
        failureCount: 0,
        goal: 'Workspace',
        id: '1',
        maxConsecutiveFailures: 3,
        phase: 'executing',
        startedAt: new Date().toISOString(),
        steps: [{ index: 1, label: 'Focus VS Code', stepId: 'step_1' }],
      },
      foregroundContext: {
        appName: 'Finder',
        available: true,
        platform: 'darwin',
      },
    })

    const advisories = evaluateStrategy({
      proposedAction: { input: { x: 80, y: 120 }, kind: 'click' },
      state,
    })

    expect(advisories.some(a => a.kind === 'focus_app_first' && a.suggestedAction?.kind === 'focus_app')).toBe(true)
  })

  it('should advise screenshot first on tainted remote runner', () => {
    const state = createBaseState({
      executionTarget: {
        hostName: 'test-host',
        isolated: false,
        mode: 'remote',
        tainted: true,
        transport: 'ssh-stdio',
      },
    })
    const advisories = evaluateStrategy({
      proposedAction: { input: { x: 100, y: 100 }, kind: 'click' },
      state,
    })

    expect(advisories.some(a => a.kind === 'take_screenshot_first')).toBe(true)
  })

  it('should advise read error when last terminal command failed', () => {
    const state = createBaseState({
      lastTerminalResult: {
        command: 'pnpm test',
        durationMs: 100,
        effectiveCwd: '/test',
        exitCode: 1,
        stderr: 'Error: tests failed',
        stdout: '',
        timedOut: false,
      },
    })
    const advisories = evaluateStrategy({
      proposedAction: { input: { command: 'pnpm test' }, kind: 'terminal_exec' },
      state,
    })

    expect(advisories.some(a => a.kind === 'read_error_first')).toBe(true)
  })

  it('should advise abort when too many failures', () => {
    const state = createBaseState({
      activeTask: {
        currentStepIndex: 2,
        failureCount: 3,
        goal: 'Test',
        id: '1',
        maxConsecutiveFailures: 3,
        phase: 'executing',
        startedAt: new Date().toISOString(),
        steps: [
          { index: 1, label: 'Step 1', outcome: 'failure', outcomeReason: 'err1', stepId: 'step_1' },
          { index: 2, label: 'Step 2', outcome: 'failure', outcomeReason: 'err2', stepId: 'step_2' },
          { index: 3, label: 'Step 3', outcome: 'failure', outcomeReason: 'err3', stepId: 'step_3' },
        ],
      },
    })
    const advisories = evaluateStrategy({
      proposedAction: { input: { command: 'test' }, kind: 'terminal_exec' },
      state,
    })

    expect(advisories.some(a => a.kind === 'abort_task')).toBe(true)
  })

  // -----------------------------------------------------------------------
  // Surface-routing rules
  // -----------------------------------------------------------------------

  it('should advise browser surface when UI action targets a browser', () => {
    const state = createBaseState({
      browserSurfaceAvailability: {
        availableSurfaces: ['browser_cdp'],
        cdp: {
          connectable: true,
          connected: true,
          endpoint: 'http://localhost:9222',
        },
        executionMode: 'local-windowed',
        extension: {
          connected: false,
          enabled: true,
        },
        preferredSurface: 'browser_cdp',
        reason: 'CDP is connected.',
        selectedToolName: 'browser_cdp_collect_elements',
        suitable: true,
      },
      foregroundContext: {
        appName: 'Google Chrome',
        available: true,
        platform: 'darwin',
      },
    })
    const advisories = evaluateStrategy({
      proposedAction: { input: { x: 200, y: 300 }, kind: 'click' },
      state,
    })

    const adv = advisories.find(a => a.kind === 'use_browser_surface')
    expect(adv).toBeDefined()
    expect(adv!.suggestedToolName).toBe('browser_cdp_collect_elements')
  })

  it('should prefer browser extension surface when the extension bridge is connected', () => {
    const state = createBaseState({
      browserSurfaceAvailability: {
        availableSurfaces: ['browser_dom', 'browser_cdp'],
        cdp: {
          connectable: true,
          connected: true,
          endpoint: 'http://localhost:9222',
        },
        executionMode: 'local-windowed',
        extension: {
          connected: true,
          enabled: true,
        },
        preferredSurface: 'browser_dom',
        reason: 'Extension bridge is already connected.',
        selectedToolName: 'browser_dom_read_page',
        suitable: true,
      },
      foregroundContext: {
        appName: 'Google Chrome',
        available: true,
        platform: 'darwin',
      },
    })

    const advisories = evaluateStrategy({
      proposedAction: { input: { x: 200, y: 300 }, kind: 'click' },
      state,
    })

    const adv = advisories.find(a => a.kind === 'use_browser_surface')
    expect(adv).toBeDefined()
    expect(adv!.suggestedToolName).toBe('browser_dom_read_page')
    expect(adv!.recommendedSurface).toBe('browser_dom')
  })

  it('should not reroute to browser surface when the execution target is remote', () => {
    const state = createBaseState({
      browserSurfaceAvailability: {
        availableSurfaces: [],
        cdp: {
          connectable: true,
          connected: true,
          endpoint: 'http://localhost:9222',
        },
        executionMode: 'remote',
        extension: {
          connected: true,
          enabled: true,
        },
        reason: 'Browser surfaces are not suitable for remote desktop.',
        suitable: false,
      },
      executionTarget: {
        hostName: 'remote-browser-host',
        isolated: false,
        mode: 'remote',
        tainted: false,
        transport: 'ssh-stdio',
      },
      foregroundContext: {
        appName: 'Google Chrome',
        available: true,
        platform: 'darwin',
      },
    })

    const advisories = evaluateStrategy({
      proposedAction: { input: { x: 200, y: 300 }, kind: 'click' },
      state,
    })

    expect(advisories.some(a => a.kind === 'use_browser_surface')).toBe(false)
  })

  it('should advise browser surface for various browser names', () => {
    for (const browser of ['Firefox', 'Safari', 'Arc', 'Brave Browser', 'Microsoft Edge']) {
      const state = createBaseState({
        foregroundContext: { appName: browser, available: true, platform: 'darwin' },
      })
      const advisories = evaluateStrategy({
        proposedAction: { input: { text: 'hello' }, kind: 'type_text' },
        state,
      })
      expect(advisories.some(a => a.kind === 'use_browser_surface'), `expected browser surface for ${browser}`).toBe(true)
    }
  })

  it('should advise accessibility grounding on macOS for non-browser screenshot', () => {
    const state = createBaseState({
      foregroundContext: {
        appName: 'Finder',
        available: true,
        platform: 'darwin',
      },
    })
    const advisories = evaluateStrategy({
      proposedAction: { input: {}, kind: 'screenshot' },
      state,
    })

    const adv = advisories.find(a => a.kind === 'use_accessibility_grounding')
    expect(adv).toBeDefined()
    expect(adv!.suggestedToolName).toBe('accessibility_snapshot')
  })

  it('should NOT advise accessibility grounding when foreground is a browser', () => {
    const state = createBaseState({
      foregroundContext: {
        appName: 'Google Chrome',
        available: true,
        platform: 'darwin',
      },
    })
    const advisories = evaluateStrategy({
      proposedAction: { input: {}, kind: 'screenshot' },
      state,
    })

    expect(advisories.some(a => a.kind === 'use_accessibility_grounding')).toBe(false)
  })

  it('should advise PTY surface when terminal_exec targets a TUI session', () => {
    const state = createBaseState({
      activePtySessionId: 'pty_1',
      foregroundContext: {
        appName: 'Terminal',
        available: true,
        platform: 'darwin',
        windowTitle: 'vim — ~/project/main.ts',
      },
      ptySessions: [
        {
          alive: true,
          cols: 80,
          createdAt: new Date().toISOString(),
          id: 'pty_1',
          pid: 4242,
          rows: 24,
        },
      ],
    })
    const advisories = evaluateStrategy({
      proposedAction: { input: { command: ':wq' }, kind: 'terminal_exec' },
      state,
    })

    const adv = advisories.find(a => a.kind === 'use_pty_surface')
    expect(adv).toBeDefined()
    expect(adv!.suggestedToolName).toBe('pty_read_screen')
  })

  it('should NOT advise PTY when terminal is not running a TUI', () => {
    const state = createBaseState({
      foregroundContext: {
        appName: 'Terminal',
        available: true,
        platform: 'darwin',
        windowTitle: 'zsh — ~/project',
      },
    })
    const advisories = evaluateStrategy({
      proposedAction: { input: { command: 'ls' }, kind: 'terminal_exec' },
      state,
    })

    expect(advisories.some(a => a.kind === 'use_pty_surface')).toBe(false)
  })

  it('should advise display enumeration when displayInfo is missing', () => {
    const state = createBaseState({ displayInfo: undefined })
    const advisories = evaluateStrategy({
      proposedAction: { input: {}, kind: 'screenshot' },
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
        logicalHeight: 1080,
        logicalWidth: 1920,
        platform: 'darwin',
      },
    })
    const advisories = evaluateStrategy({
      proposedAction: { input: {}, kind: 'screenshot' },
      state,
    })

    expect(advisories.some(a => a.kind === 'enumerate_displays_first')).toBe(false)
  })

  it('should emit multiple surface advisories when applicable', () => {
    // macOS + non-browser + screenshot + no displayInfo → accessibility + display
    const state = createBaseState({
      displayInfo: undefined,
      foregroundContext: {
        appName: 'Cursor',
        available: true,
        platform: 'darwin',
      },
    })
    const advisories = evaluateStrategy({
      proposedAction: { input: {}, kind: 'screenshot' },
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
      errorMessage: 'process timeout after 30000ms',
      failedAction: { input: { command: 'slow-cmd' }, kind: 'terminal_exec' },
      state: createBaseState(),
    })

    expect(result.kind).toBe('wait_and_retry')
  })

  it('should suggest read_error_first on terminal failure', () => {
    const result = buildRecoveryPlan({
      errorMessage: 'command not found',
      failedAction: { input: { command: 'bad-cmd' }, kind: 'terminal_exec' },
      state: createBaseState({
        lastTerminalResult: {
          command: 'bad-cmd',
          durationMs: 10,
          effectiveCwd: '/test',
          exitCode: 127,
          stderr: 'command not found: bad-cmd',
          stdout: '',
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
      errorMessage: 'click failed',
      failedAction: { input: { x: 100, y: 100 }, kind: 'click' },
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
      errorMessage: 'command not found: :wq',
      failedAction: { input: { command: ':wq' }, kind: 'terminal_exec' },
      state: createBaseState({
        activePtySessionId: 'pty_1',
        activeWindowTitle: 'nvim — main.ts',
        foregroundContext: {
          appName: 'iTerm2',
          available: true,
          platform: 'darwin',
        },
        ptySessions: [
          {
            alive: true,
            cols: 80,
            createdAt: new Date().toISOString(),
            id: 'pty_1',
            pid: 4242,
            rows: 24,
          },
        ],
      }),
    })

    expect(result.kind).toBe('use_pty_surface')
    expect(result.suggestedToolName).toBe('pty_read_screen')
  })

  it('should suggest browser surface when UI action fails in a browser', () => {
    const result = buildRecoveryPlan({
      errorMessage: 'element not found at coordinates',
      failedAction: { input: { x: 400, y: 300 }, kind: 'click' },
      state: createBaseState({
        browserSurfaceAvailability: {
          availableSurfaces: ['browser_dom'],
          cdp: {
            connectable: false,
            connected: false,
            endpoint: 'http://localhost:9222',
            lastError: 'connection refused',
          },
          executionMode: 'local-windowed',
          extension: {
            connected: true,
            enabled: true,
          },
          preferredSurface: 'browser_dom',
          reason: 'Extension bridge is already connected.',
          selectedToolName: 'browser_dom_read_page',
          suitable: true,
        },
        foregroundContext: {
          appName: 'Google Chrome',
          available: true,
          platform: 'darwin',
        },
      }),
    })

    expect(result.kind).toBe('use_browser_surface')
    expect(result.suggestedToolName).toBe('browser_dom_read_page')
  })

  it('should not fall back to CDP in recovery when browser surfaces are unsuitable', () => {
    const result = buildRecoveryPlan({
      errorMessage: 'element not found at coordinates',
      failedAction: { input: { x: 400, y: 300 }, kind: 'click' },
      state: createBaseState({
        browserSurfaceAvailability: {
          availableSurfaces: [],
          cdp: {
            connectable: true,
            connected: true,
            endpoint: 'http://localhost:9222',
          },
          executionMode: 'remote',
          extension: {
            connected: true,
            enabled: true,
          },
          reason: 'Browser surfaces are not suitable for remote desktop.',
          suitable: false,
        },
        executionTarget: {
          hostName: 'remote-browser-host',
          isolated: false,
          mode: 'remote',
          tainted: false,
          transport: 'ssh-stdio',
        },
        foregroundContext: {
          appName: 'Google Chrome',
          available: true,
          platform: 'darwin',
        },
      }),
    })

    expect(result.kind).toBe('take_screenshot_first')
    expect(result.suggestedToolName).toBeUndefined()
  })

  it('should suggest accessibility when observation fails on macOS', () => {
    const result = buildRecoveryPlan({
      errorMessage: 'screen recording permission denied',
      failedAction: { input: {}, kind: 'screenshot' },
      state: createBaseState({
        foregroundContext: {
          appName: 'Finder',
          available: true,
          platform: 'darwin',
        },
      }),
    })

    expect(result.kind).toBe('use_accessibility_grounding')
    expect(result.suggestedToolName).toBe('accessibility_snapshot')
  })

  it('should fall through to generic screenshot for non-macOS observation failure', () => {
    const result = buildRecoveryPlan({
      errorMessage: 'display capture failed',
      failedAction: { input: {}, kind: 'screenshot' },
      state: createBaseState({
        foregroundContext: {
          appName: 'Files',
          available: true,
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
      category: 'informational',
      kind: 'proceed',
      reason: 'ok',
      recommendedSurface: 'none',
    }])
    expect(result).toBe('')
  })

  it('should format advisory summary with category and surface', () => {
    const result = summarizeAdvisories([
      {
        category: 'prep',
        kind: 'focus_app_first',
        reason: 'Wrong app',
        recommendedSurface: 'desktop',
      },
      {
        category: 'recovery',
        kind: 'read_error_first',
        reason: 'Error exists',
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
      category: 'recovery',
      kind: 'abort_task',
      reason: 'Too many failures',
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
      displayInfo: undefined,
      foregroundContext: {
        appName: 'Finder',
        available: true,
        platform: 'darwin',
      },
    })
    const advisories = evaluateStrategy({
      proposedAction: { input: {}, kind: 'screenshot' },
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
      errorMessage: 'click failed',
      failedAction: { input: { x: 100, y: 100 }, kind: 'click' },
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
