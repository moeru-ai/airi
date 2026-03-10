/**
 * 类型声明文件
 * 为没有类型定义的模块提供声明
 */

// screenshot-desktop 模块声明
declare module 'screenshot-desktop' {
  interface Display {
    id: string | number
    name: string
  }

  interface ScreenshotOptions {
    screen?: string | number
  }

  function screenshot(options?: ScreenshotOptions): Promise<Buffer>
  function listDisplays(): Promise<Display[]>

  export { screenshot as default, listDisplays }
}

// active-win 模块声明
declare module 'active-win' {
  interface WindowInfo {
    id: number
    title: string
    owner: {
      name: string
      processId: number
    }
    bounds: {
      x: number
      y: number
      width: number
      height: number
    }
  }

  function activeWin(): Promise<WindowInfo | null>

  export { activeWin as default }
  export type { WindowInfo }
}

// robotjs 模块声明
declare module 'robotjs' {
  interface Point {
    x: number
    y: number
  }

  interface ScreenSize {
    width: number
    height: number
  }

  interface Bitmap {
    width: number
    height: number
    image: Buffer
    colorAt(x: number, y: number): string
  }

  // 鼠标控制
  export function moveMouse(x: number, y: number): void
  export function moveMouseSmooth(x: number, y: number): void
  export function mouseClick(button?: 'left' | 'right' | 'middle', double?: boolean): void
  export function mouseToggle(down: 'down' | 'up', button?: 'left' | 'right' | 'middle'): void
  export function dragMouse(x: number, y: number): void
  export function scrollMouse(x: number, y: number): void
  export function getMousePos(): Point
  export function getScreenSize(): ScreenSize

  // 键盘控制
  export function keyTap(key: string, modifier?: string | string[]): void
  export function keyToggle(key: string, down: 'down' | 'up', modifier?: string | string[]): void
  export function typeString(text: string): void

  // 屏幕
  export namespace screen {
    export function capture(x?: number, y?: number, width?: number, height?: number): Bitmap
  }

  // 位图
  export namespace bitmap {
    export function read(path: string): Bitmap
    export function save(path: string, bitmap: Bitmap): void
  }
}

// 扩展 Node.js Buffer
declare global {
  interface Buffer {
    toString(encoding?: string): string
  }
}

export {}
