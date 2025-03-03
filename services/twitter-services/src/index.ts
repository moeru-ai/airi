import process from 'node:process'

import { AiriAdapter } from './adapters/airi-adapter'
import { BrowserBaseMCPAdapter } from './adapters/browserbase-adapter'
import { MCPAdapter } from './adapters/mcp-adapter'
import { createDefaultConfig } from './config'
import { TwitterService } from './core/twitter-service'
import { initializeLogger, logger } from './utils/logger'

/**
 * Twitter 服务启动器类
 * 负责初始化和启动服务
 */
export class TwitterServiceLauncher {
  private browser?: BrowserBaseMCPAdapter
  private twitterService?: TwitterService
  private airiAdapter?: AiriAdapter
  private mcpAdapter?: MCPAdapter

  /**
   * 启动 Twitter 服务
   */
  async start() {
    try {
      // 加载配置
      const configManager = createDefaultConfig()
      const config = configManager.getConfig()

      // 初始化日志系统
      initializeLogger()
      logger.main.log('正在启动 Twitter 服务...')

      // 初始化浏览器
      this.browser = new BrowserBaseMCPAdapter(
        config.browserbase.apiKey,
        config.browserbase.endpoint,
        {
          timeout: config.browser.requestTimeout,
          retries: config.browser.requestRetries,
        },
      )

      await this.browser.initialize(config.browser)
      logger.main.log('浏览器已初始化')

      // 创建 Twitter 服务
      this.twitterService = new TwitterService(this.browser)

      // 尝试登录
      if (config.twitter.credentials) {
        const success = await this.twitterService.login(config.twitter.credentials)
        if (success) {
          logger.main.log('成功登录 Twitter')
        }
        else {
          logger.main.error('Twitter 登录失败!')
        }
      }

      // 启动适配器
      if (config.adapters.airi?.enabled && this.twitterService) {
        this.airiAdapter = new AiriAdapter(this.twitterService, {
          url: config.adapters.airi.url,
          token: config.adapters.airi.token,
          credentials: config.twitter.credentials!,
        })

        await this.airiAdapter.start()
        logger.main.log('Airi 适配器已启动')
      }

      if (config.adapters.mcp?.enabled && this.twitterService) {
        this.mcpAdapter = new MCPAdapter(this.twitterService, config.adapters.mcp.port)

        await this.mcpAdapter.start()
        logger.main.log('MCP 适配器已启动')
      }

      logger.main.log('Twitter 服务已成功启动!')

      // 设置关闭钩子
      this.setupShutdownHooks()
    }
    catch (error) {
      logger.main.withError(error).error('启动 Twitter 服务失败')
    }
  }

  /**
   * 停止服务
   */
  async stop() {
    logger.main.log('正在停止 Twitter 服务...')

    // 停止 MCP 适配器
    if (this.mcpAdapter) {
      await this.mcpAdapter.stop()
      logger.main.log('MCP 适配器已停止')
    }

    // 关闭浏览器
    if (this.browser) {
      await this.browser.close()
      logger.main.log('浏览器已关闭')
    }

    logger.main.log('Twitter 服务已停止')
  }

  /**
   * 设置关闭钩子
   */
  private setupShutdownHooks() {
    // 处理进程退出
    process.on('SIGINT', async () => {
      logger.main.log('接收到退出信号...')
      await this.stop()
      process.exit(0)
    })

    process.on('SIGTERM', async () => {
      logger.main.log('接收到终止信号...')
      await this.stop()
      process.exit(0)
    })

    // 处理未捕获的异常
    process.on('uncaughtException', async (error) => {
      logger.main.withError(error).error('未捕获的异常')
      await this.stop()
      process.exit(1)
    })
  }
}

export { AiriAdapter } from './adapters/airi-adapter'
export * from './adapters/browser-adapter'
export { BrowserBaseMCPAdapter } from './adapters/browserbase-adapter'
export { MCPAdapter } from './adapters/mcp-adapter'
export * from './core/twitter-service'
export * from './types/browser'

// 直接启动服务的入口点
if (require.main === module) {
  const launcher = new TwitterServiceLauncher()
  launcher.start().catch((error) => {
    logger.main.withError(error).error('启动失败')
    process.exit(1)
  })
}
