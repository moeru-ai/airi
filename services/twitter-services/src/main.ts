import process from 'node:process'

import { TwitterServiceLauncher } from './launcher'
import { initializeLogger, logger } from './utils/logger'

// 确保初始化只发生一次
async function bootstrap() {
  // 1. 首先初始化日志系统
  initializeLogger()

  // 2. 然后创建并启动服务
  const launcher = new TwitterServiceLauncher()

  try {
    await launcher.start()
    logger.main.log('Twitter 服务已成功启动')
  }
  catch (error) {
    logger.main.withError(error).error('启动失败')
    process.exit(1)
  }

  // 设置进程事件处理
  process.on('unhandledRejection', (reason) => {
    logger.main.withError(reason).error('未处理的 Promise 拒绝:')
  })
}

// 启动应用
bootstrap()
