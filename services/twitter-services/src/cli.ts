#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { Command } from 'commander'

import { StagehandBrowserAdapter } from './adapters/browserbase-adapter'
import { createDefaultConfig } from './config'
import { TwitterService } from './core/twitter-service'
import { TwitterServiceLauncher } from './launcher'
import { errorToMessage } from './utils/error'

// Get version
const packageJsonPath = path.join(__dirname, '..', 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

// Create program
const program = new Command()

// Set basic info
program
  .name('twitter-services')
  .description('Twitter Services CLI - Access and manage Twitter data')
  .version(packageJson.version)

// Start service command
program
  .command('start')
  .description('Start Twitter service')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    if (options.config) {
      process.env.CONFIG_PATH = options.config
    }

    const launcher = new TwitterServiceLauncher()
    await launcher.start()

    console.log('Service started, press Ctrl+C to stop')
  })

// Get timeline command
program
  .command('timeline')
  .description('Get Twitter timeline')
  .option('-c, --count <number>', 'Number of tweets to fetch', '10')
  .option('--no-replies', 'Exclude replies')
  .option('--no-retweets', 'Exclude retweets')
  .option('-o, --output <path>', 'Output results to file')
  .action(async (options) => {
    try {
      const configManager = createDefaultConfig()
      const config = configManager.getConfig()

      // Initialize browser
      const browser = new StagehandBrowserAdapter(config.browser.apiKey)
      await browser.initialize(config.browser)

      // Create service and login
      const twitterService = new TwitterService(browser)

      if (!config.twitter.credentials) {
        throw new Error('Cannot get Twitter credentials, please check configuration')
      }

      const loggedIn = await twitterService.login(config.twitter.credentials)

      if (!loggedIn) {
        throw new Error('Login failed, please check credentials')
      }

      console.log('Fetching timeline...')

      // Get timeline
      const tweets = await twitterService.getTimeline({
        count: Number.parseInt(options.count),
        includeReplies: options.replies,
        includeRetweets: options.retweets,
      })

      // Process results
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

      // Output results
      if (options.output) {
        fs.writeFileSync(options.output, JSON.stringify(result, null, 2))
        console.log(`Results saved to ${options.output}`)
      }
      else {
        console.log(JSON.stringify(result, null, 2))
      }

      // Close browser
      await browser.close()
    }
    catch (error) {
      console.error('Failed to get timeline:', errorToMessage(error))
      process.exit(1)
    }
  })

// Export cookies command
program
  .command('export-cookies')
  .description('Login and export cookies for later use')
  .option('-o, --output <path>', 'Output cookies to file', 'twitter-cookies.json')
  .option('-f, --format <format>', 'Cookie format (json or string)', 'json')
  .action(async (options) => {
    try {
      const configManager = createDefaultConfig()
      const config = configManager.getConfig()

      // Initialize browser
      const browser = new StagehandBrowserAdapter(config.browser.apiKey)
      await browser.initialize(config.browser)

      // Create service and login
      const twitterService = new TwitterService(browser)

      if (!config.twitter.credentials) {
        throw new Error('Cannot get Twitter credentials, please check configuration')
      }

      const loggedIn = await twitterService.login(config.twitter.credentials)

      if (!loggedIn) {
        throw new Error('Login failed, please check credentials')
      }

      console.log('Login successful, exporting cookies...')

      // Export cookies - specify the format based on user option
      const cookieFormat = options.format === 'string' ? 'string' : 'object'
      const cookies = await twitterService.exportCookies(cookieFormat)

      if (cookieFormat === 'string') {
        // Save raw string to file
        fs.writeFileSync(options.output, cookies as string)
      }
      else {
        // Save JSON to file
        fs.writeFileSync(options.output, JSON.stringify(cookies, null, 2))
      }

      console.log(`Cookies saved to ${options.output} in ${cookieFormat} format`)

      // Close browser
      await browser.close()
    }
    catch (error) {
      console.error('Failed to export cookies:', errorToMessage(error))
      process.exit(1)
    }
  })

// Login with cookies file command
program
  .command('login-with-cookies')
  .description('Login using cookies from a file')
  .option('-i, --input <path>', 'Input cookies file', 'twitter-cookies.json')
  .option('-t, --test', 'Test login only, do not perform other actions', false)
  .action(async (options) => {
    try {
      const configManager = createDefaultConfig()
      const config = configManager.getConfig()

      // Load cookies from file
      if (!fs.existsSync(options.input)) {
        throw new Error(`Cookies file not found: ${options.input}`)
      }

      console.log(`Loading cookies from ${options.input}`)
      const cookies = JSON.parse(fs.readFileSync(options.input, 'utf8'))

      // Initialize browser
      const browser = new StagehandBrowserAdapter(config.browser.apiKey)
      await browser.initialize(config.browser)

      // Create service and login with cookies
      const twitterService = new TwitterService(browser)
      const credentials = {
        username: config.twitter.credentials?.username || '',
        password: config.twitter.credentials?.password || '',
        cookies,
      }

      console.log('Attempting to login with cookies...')
      const loggedIn = await twitterService.login(credentials)

      if (loggedIn) {
        console.log('Login successful!')

        if (options.test) {
          console.log('Login test passed, exiting.')
        }
        else {
          // Perform additional actions if needed
          console.log('Add more actions here when needed')
        }
      }
      else {
        throw new Error('Login failed, cookies may be expired')
      }

      // Close browser
      await browser.close()
    }
    catch (error) {
      console.error('Failed to login with cookies:', errorToMessage(error))
      process.exit(1)
    }
  })

// Parse command line arguments
program.parse()
