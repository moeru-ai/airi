#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { Command } from 'commander'

import { BrowserBaseMCPAdapter } from './adapters/browserbase-adapter'
import { createDefaultConfig } from './config'
import { TwitterService } from './core/twitter-service'
import { TwitterServiceLauncher } from './launcher'
import { errorToMessage } from './utils/error'

// 获取版本
const packageJsonPath = path.join(__dirname, '..', 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

// 创建程序
const program = new Command()

// 设置基本信息
program
  .name('twitter-services')
  .description('Twitter 服务 CLI - 访问和管理 Twitter 数据')
  .version(packageJson.version)

// 启动服务命令
program
  .command('start')
  .description('启动 Twitter 服务')
  .option('-c, --config <path>', '配置文件路径')
  .action(async (options) => {
    if (options.config) {
      process.env.CONFIG_PATH = options.config
    }

    const launcher = new TwitterServiceLauncher()
    await launcher.start()

    console.log('服务已启动，按 Ctrl+C 停止')
  })

// 获取时间线命令
program
  .command('timeline')
  .description('获取 Twitter 时间线')
  .option('-c, --count <number>', '要获取的推文数量', '10')
  .option('--no-replies', '排除回复')
  .option('--no-retweets', '排除转发')
  .option('-o, --output <path>', '输出结果到文件')
  .action(async (options) => {
    try {
      const configManager = createDefaultConfig()
      const config = configManager.getConfig()

      // 初始化浏览器
      const browser = new BrowserBaseMCPAdapter(config.browserbase.apiKey)
      await browser.initialize(config.browser)

      // 创建服务并登录
      const twitterService = new TwitterService(browser)

      if (!config.twitter.credentials) {
        throw new Error('无法获取 Twitter 凭据，请检查配置')
      }

      const loggedIn = await twitterService.login(config.twitter.credentials)

      if (!loggedIn) {
        throw new Error('登录失败，请检查凭据')
      }

      console.log('正在获取时间线...')

      // 获取时间线
      const tweets = await twitterService.getTimeline({
        count: Number.parseInt(options.count),
        includeReplies: options.replies,
        includeRetweets: options.retweets,
      })

      // 处理结果
      const result = tweets.map(tweet => ({
        id: tweet.id,
        text: tweet.text,
        author: tweet.author.displayName,
        username: tweet.author.username,
        timestamp: tweet.timestamp,
        likeCount: tweet.likeCount,
        retweetCount: tweet.retweetCount,
        replyCount: tweet.replyCount,
      }))

      // 输出结果
      if (options.output) {
        fs.writeFileSync(options.output, JSON.stringify(result, null, 2))
        console.log(`结果已保存到 ${options.output}`)
      }
      else {
        console.log(JSON.stringify(result, null, 2))
      }

      // 关闭浏览器
      await browser.close()
    }
    catch (error) {
      console.error('获取时间线失败:', errorToMessage(error))
      process.exit(1)
    }
  })

// 解析命令行参数
program.parse()
