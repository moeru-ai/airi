import type { DesktopExecutor } from '../types'
import type { DesktopScene, WindowNode } from './types'

function fallbackBounds() {
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  }
}

function findScreenId(
  screens: DesktopScene['screens'],
  bounds: WindowNode['bounds'],
) {
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  }

  const matched = screens.find((screen) => {
    const area = screen.bounds
    return center.x >= area.x
      && center.x < area.x + area.width
      && center.y >= area.y
      && center.y < area.y + area.height
  })

  return matched?.id || screens[0]?.id || 'screen:unknown'
}

export class DesktopSceneService {
  private lastPointer = { x: 0, y: 0 }
  private lastScene?: DesktopScene

  constructor(
    private readonly executor: Pick<DesktopExecutor, 'getDisplayInfo' | 'observeWindows'>,
    private readonly getPointerPosition: () => { x: number, y: number } | undefined,
  ) {}

  getLastScene() {
    return this.lastScene
  }

  getPointer() {
    const pointer = this.getPointerPosition()
    if (pointer) {
      this.lastPointer = pointer
    }
    return this.lastPointer
  }

  async observeScene(): Promise<DesktopScene> {
    const [displayInfo, observation] = await Promise.all([
      this.executor.getDisplayInfo(),
      this.executor.observeWindows({ limit: 64 }),
    ])

    const screens: DesktopScene['screens'] = displayInfo.displays?.map(display => ({
      id: `screen:${display.displayId}`,
      bounds: display.bounds,
    }))
    || (displayInfo.available && displayInfo.logicalWidth && displayInfo.logicalHeight
      ? [{
          id: 'screen:main',
          bounds: {
            x: 0,
            y: 0,
            width: displayInfo.logicalWidth,
            height: displayInfo.logicalHeight,
          },
        }]
      : [])

    const windows = observation.windows.map((windowInfo, index): WindowNode => {
      const bounds = windowInfo.bounds || fallbackBounds()
      return {
        id: windowInfo.id,
        windowNumber: windowInfo.windowNumber,
        appName: windowInfo.appName,
        title: windowInfo.title || '',
        bounds,
        ownerPid: windowInfo.ownerPid,
        focused: Boolean(
          observation.frontmostAppName
          && windowInfo.appName === observation.frontmostAppName
          && observation.frontmostWindowTitle
          && windowInfo.title === observation.frontmostWindowTitle,
        ),
        zIndex: typeof windowInfo.layer === 'number' ? windowInfo.layer : index,
        screenId: findScreenId(screens, bounds),
      }
    })

    const pointer = this.getPointerPosition() || this.lastPointer
    this.lastPointer = pointer

    const focusedWindow = windows.find(window => window.focused)

    const scene: DesktopScene = {
      capturedAt: observation.observedAt,
      screens,
      windows,
      pointer,
      focusedApp: observation.frontmostAppName,
      focusedWindowId: focusedWindow?.id,
    }

    this.lastScene = scene
    return scene
  }
}
