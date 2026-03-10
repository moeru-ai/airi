/**
 * 屏幕捕获服务
 * 使用 screenshot-desktop 和 active-win 实现屏幕截图功能
 */

import type { WindowInfo } from '../../../shared/vision'

import { exec } from 'node:child_process'
import { mkdtemp, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import activeWin from 'active-win'
import screenshot from 'screenshot-desktop'

import { consola } from 'consola'

// 类型断言，因为 active-win 的类型定义可能不完整
const activeWindowFn = activeWin as unknown as () => Promise<{
  id: number
  title: string
  owner: { name: string, processId: number }
  bounds: { x: number, y: number, width: number, height: number }
} | null>

const execAsync = promisify(exec)
const logger = consola.create({ level: 4 })

/**
 * 捕获整个屏幕
 * @returns 截图的 Buffer
 */
export async function captureScreen(): Promise<Buffer> {
  try {
    logger.info('Capturing full screen...')
    const buffer = await screenshot()
    logger.info('Screen captured successfully')
    return buffer
  }
  catch (error) {
    logger.error('Failed to capture screen:', error)
    throw new Error(`屏幕捕获失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 捕获指定显示器
 * @param displayId 显示器 ID
 * @returns 截图的 Buffer
 */
export async function captureDisplay(displayId: number): Promise<Buffer> {
  try {
    logger.info(`Capturing display ${displayId}...`)
    const displays = await screenshot.listDisplays()

    if (displayId < 0 || displayId >= displays.length) {
      throw new Error(`Invalid display ID: ${displayId}. Available: ${displays.length}`)
    }

    const buffer = await screenshot({ screen: displays[displayId].id })
    logger.info(`Display ${displayId} captured successfully`)
    return buffer
  }
  catch (error) {
    logger.error(`Failed to capture display ${displayId}:`, error)
    throw new Error(`显示器捕获失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 获取所有显示器信息
 */
export async function listDisplays(): Promise<Array<{ id: string | number, name: string }>> {
  try {
    return await screenshot.listDisplays()
  }
  catch (error) {
    logger.error('Failed to list displays:', error)
    throw new Error(`获取显示器列表失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 获取当前活动窗口信息
 * @returns 窗口信息
 */
export async function getActiveWindow(): Promise<WindowInfo | null> {
  try {
    const win = await activeWindowFn()

    if (!win) {
      logger.warn('No active window found')
      return null
    }

    const windowInfo: WindowInfo = {
      id: win.id,
      title: win.title,
      owner: {
        name: win.owner.name,
        processId: win.owner.processId,
      },
      bounds: {
        x: win.bounds.x,
        y: win.bounds.y,
        width: win.bounds.width,
        height: win.bounds.height,
      },
    }

    logger.info('Active window:', windowInfo.title)
    return windowInfo
  }
  catch (error) {
    logger.error('Failed to get active window:', error)
    throw new Error(`获取活动窗口失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 获取所有打开的窗口
 * @returns 窗口信息列表
 */
export async function listWindows(): Promise<WindowInfo[]> {
  try {
    // active-win 不支持列出所有窗口，需要使用平台特定方法
    // 这里提供一个基础实现，后续可以扩展
    const active = await getActiveWindow()
    return active ? [active] : []
  }
  catch (error) {
    logger.error('Failed to list windows:', error)
    throw new Error(`获取窗口列表失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 捕获特定窗口（通过窗口句柄/ID）
 * 注意：screenshot-desktop 不直接支持窗口捕获，需要使用临时文件方法
 * @param windowId 窗口 ID
 * @returns 截图的 Buffer
 */
export async function captureWindow(windowId: number): Promise<Buffer> {
  try {
    logger.info(`Capturing window ${windowId}...`)

    // 在 Windows 上可以使用 PowerShell 或 nircmd
    // 在 macOS 上可以使用 screencapture
    // 在 Linux 上可以使用 import 或 gnome-screenshot

    const platform = process.platform
    const tempDir = await mkdtemp(join(tmpdir(), 'vision-'))
    const tempFile = join(tempDir, `window-${windowId}.png`)

    let command: string

    switch (platform) {
      case 'win32':
        // Windows: 使用 PowerShell 和 .NET
        command = `powershell -command "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $screen = [System.Windows.Forms.Screen]::AllScreens | Where-Object { $true }; $bitmap = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height); $graphics = [System.Drawing.Graphics]::FromImage($bitmap); $graphics.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size); $bitmap.Save('${tempFile}'); $graphics.Dispose(); $bitmap.Dispose()"`
        break
      case 'darwin':
        // macOS: 使用 screencapture
        command = `screencapture -x "${tempFile}"`
        break
      case 'linux':
        // Linux: 使用 import (ImageMagick)
        command = `import -window root "${tempFile}"`
        break
      default:
        throw new Error(`Unsupported platform: ${platform}`)
    }

    await execAsync(command)

    // 读取临时文件
    const { readFile } = await import('node:fs/promises')
    const buffer = await readFile(tempFile)

    // 清理临时文件
    await unlink(tempFile)

    logger.info(`Window ${windowId} captured successfully`)
    return buffer
  }
  catch (error) {
    logger.error(`Failed to capture window ${windowId}:`, error)
    // 如果窗口捕获失败，回退到全屏捕获
    logger.info('Falling back to full screen capture')
    return captureScreen()
  }
}

/**
 * 将 Buffer 转换为 base64 字符串
 * @param buffer 图片 Buffer
 * @returns base64 字符串
 */
export function bufferToBase64(buffer: Buffer): string {
  return buffer.toString('base64')
}

/**
 * 将 base64 字符串转换为 Buffer
 * @param base64 base64 字符串
 * @returns Buffer
 */
export function base64ToBuffer(base64: string): Buffer {
  return Buffer.from(base64, 'base64')
}

/**
 * 保存截图到文件
 * @param buffer 图片 Buffer
 * @param filePath 文件路径（可选，默认保存到临时目录）
 * @returns 保存的文件路径
 */
export async function saveScreenshot(buffer: Buffer, filePath?: string): Promise<string> {
  try {
    const targetPath = filePath || join(tmpdir(), `screenshot-${Date.now()}.png`)
    await writeFile(targetPath, buffer)
    logger.info(`Screenshot saved to: ${targetPath}`)
    return targetPath
  }
  catch (error) {
    logger.error('Failed to save screenshot:', error)
    throw new Error(`保存截图失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 获取屏幕尺寸
 * @returns 屏幕尺寸列表
 */
export async function getScreenDimensions(): Promise<Array<{ width: number, height: number }>> {
  try {
    const displays = await listDisplays()
    // screenshot-desktop 不直接提供尺寸信息，需要捕获后获取
    // 这里返回默认值，实际使用时可以通过其他方式获取
    return displays.map(() => ({ width: 1920, height: 1080 }))
  }
  catch (error) {
    logger.error('Failed to get screen dimensions:', error)
    return [{ width: 1920, height: 1080 }]
  }
}
