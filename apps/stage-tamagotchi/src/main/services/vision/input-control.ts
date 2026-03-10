/**
 * 输入控制服务
 * 使用 robotjs 实现真实的鼠标和键盘控制
 */

import type { Action } from '../../../shared/vision'

import { consola } from 'consola'

const logger = consola.create({ level: 4 })

// 动态导入 robotjs（因为它有原生依赖）
let robot: typeof import('robotjs') | null = null

/**
 * 初始化 robotjs
 */
async function initRobot(): Promise<typeof import('robotjs')> {
  if (robot) {
    return robot
  }

  try {
    robot = await import('robotjs')
    logger.info('Robotjs initialized successfully')
    return robot
  }
  catch (error) {
    logger.error('Failed to load robotjs:', error)
    throw new Error('无法加载 robotjs，请确保已正确安装')
  }
}

/**
 * 执行鼠标点击
 * @param x X 坐标
 * @param y Y 坐标
 * @param button 鼠标按钮
 * @param doubleClick 是否双击
 */
export async function mouseClick(
  x: number,
  y: number,
  button: 'left' | 'right' | 'middle' = 'left',
  doubleClick: boolean = false,
): Promise<void> {
  const r = await initRobot()

  logger.info(`Mouse click at (${x}, ${y}), button: ${button}, double: ${doubleClick}`)

  // 移动鼠标到指定位置
  r.moveMouse(x, y)

  // 等待一小段时间确保鼠标已移动
  await sleep(50)

  // 执行点击
  if (doubleClick) {
    r.mouseClick(button)
    await sleep(50)
    r.mouseClick(button)
  }
  else {
    r.mouseClick(button)
  }

  logger.info('Mouse click executed')
}

/**
 * 执行鼠标移动
 * @param x X 坐标
 * @param y Y 坐标
 */
export async function mouseMove(x: number, y: number): Promise<void> {
  const r = await initRobot()

  logger.info(`Moving mouse to (${x}, ${y})`)
  r.moveMouse(x, y)
}

/**
 * 执行鼠标滚动
 * @param amount 滚动量（正数向下，负数向上）
 * @param direction 滚动方向
 */
export async function mouseScroll(
  amount: number,
  direction: 'vertical' | 'horizontal' = 'vertical',
): Promise<void> {
  const r = await initRobot()

  logger.info(`Scrolling ${direction}: ${amount}`)

  if (direction === 'vertical') {
    r.scrollMouse(0, amount)
  }
  else {
    r.scrollMouse(amount, 0)
  }
}

/**
 * 执行键盘按键
 * @param key 按键名称
 * @param modifiers 修饰键
 */
export async function keyPress(
  key: string,
  modifiers: string[] = [],
): Promise<void> {
  const r = await initRobot()

  logger.info(`Key press: ${key}, modifiers: ${modifiers.join('+')}`)

  // 转换按键名称到 robotjs 格式
  const robotKey = convertKeyName(key)

  if (modifiers.length > 0) {
    // 按住修饰键
    for (const modifier of modifiers) {
      r.keyToggle(convertKeyName(modifier), 'down')
    }

    // 按下目标键
    r.keyTap(robotKey)

    // 释放修饰键
    for (const modifier of modifiers) {
      r.keyToggle(convertKeyName(modifier), 'up')
    }
  }
  else {
    r.keyTap(robotKey)
  }
}

/**
 * 输入文本
 * @param text 要输入的文本
 */
export async function typeText(text: string): Promise<void> {
  const r = await initRobot()

  logger.info(`Typing text: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`)

  r.typeString(text)
}

/**
 * 获取鼠标当前位置
 */
export async function getMousePosition(): Promise<{ x: number, y: number }> {
  const r = await initRobot()

  const pos = r.getMousePos()
  return { x: pos.x, y: pos.y }
}

/**
 * 获取屏幕尺寸
 */
export async function getScreenSize(): Promise<{ width: number, height: number }> {
  const r = await initRobot()

  const size = r.getScreenSize()
  return { width: size.width, height: size.height }
}

/**
 * 执行输入操作
 * @param action 操作定义
 */
export async function executeInputAction(action: Action): Promise<void> {
  logger.info(`Executing action: ${action.type}`)

  switch (action.type) {
    case 'click':
      if (action.coordinates) {
        await mouseClick(
          action.coordinates.x,
          action.coordinates.y,
          'left',
          false,
        )
      }
      else {
        throw new Error('Click action requires coordinates')
      }
      break

    case 'doubleClick':
      if (action.coordinates) {
        await mouseClick(
          action.coordinates.x,
          action.coordinates.y,
          'left',
          true,
        )
      }
      else {
        throw new Error('Double click action requires coordinates')
      }
      break

    case 'rightClick':
      if (action.coordinates) {
        await mouseClick(
          action.coordinates.x,
          action.coordinates.y,
          'right',
          false,
        )
      }
      else {
        throw new Error('Right click action requires coordinates')
      }
      break

    case 'type':
      if (action.text) {
        await typeText(action.text)
      }
      else {
        throw new Error('Type action requires text')
      }
      break

    case 'scroll':
      if (action.scrollAmount) {
        await mouseScroll(action.scrollAmount, 'vertical')
      }
      else {
        throw new Error('Scroll action requires scrollAmount')
      }
      break

    case 'keypress':
      if (action.key) {
        await keyPress(action.key)
      }
      else {
        throw new Error('Keypress action requires key')
      }
      break

    default:
      throw new Error(`Unsupported action type: ${action.type}`)
  }

  logger.info('Action executed successfully')
}

/**
 * 转换按键名称到 robotjs 格式
 * @param key 按键名称
 */
function convertKeyName(key: string): string {
  const keyMap: Record<string, string> = {
    // 特殊键
    enter: 'return',
    return: 'return',
    esc: 'escape',
    escape: 'escape',
    space: 'space',
    tab: 'tab',
    backspace: 'backspace',
    delete: 'delete',
    del: 'delete',
    insert: 'insert',
    home: 'home',
    end: 'end',
    pageup: 'pageup',
    pagedown: 'pagedown',
    // 方向键
    up: 'up',
    down: 'down',
    left: 'left',
    right: 'right',
    // 功能键
    f1: 'f1',
    f2: 'f2',
    f3: 'f3',
    f4: 'f4',
    f5: 'f5',
    f6: 'f6',
    f7: 'f7',
    f8: 'f8',
    f9: 'f9',
    f10: 'f10',
    f11: 'f11',
    f12: 'f12',
    // 修饰键
    ctrl: 'control',
    control: 'control',
    alt: 'alt',
    shift: 'shift',
    command: 'command',
    cmd: 'command',
    win: 'command',
    // 其他常用键
    capslock: 'capslock',
    printscreen: 'printscreen',
    scrolllock: 'scrolllock',
    pause: 'pause',
    menu: 'menu',
  }

  const lowerKey = key.toLowerCase()
  return keyMap[lowerKey] || lowerKey
}

/**
 * 睡眠函数
 * @param ms 毫秒数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 检查 robotjs 是否可用
 */
export async function isRobotAvailable(): Promise<boolean> {
  try {
    await initRobot()
    return true
  }
  catch {
    return false
  }
}
