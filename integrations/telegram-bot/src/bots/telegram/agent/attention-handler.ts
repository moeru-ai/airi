import type { Message } from 'grammy/types'

import type { AttentionConfig, AttentionState, BotContext } from '../../../types'

export function createAttentionHandler(bot: BotContext, config: AttentionConfig) {
  // Private state
  const state: AttentionState = {
    currentResponseRate: config.initialResponseRate,
    lastResponseTimes: new Map(),
    stats: {
      lastInteractionTime: Date.now(),
      mentionCount: 0,
      triggerWordCount: 0,
    },
  }

  // Private utility functions
  const calculateNewResponseRate = () => {
    const minutesSinceLastInteraction = (Date.now() - state.stats.lastInteractionTime) / 60000
    const decayFactor = Math.max(0, 1 - minutesSinceLastInteraction * config.decayRatePerMinute)

    // Reset to max if at minimum and new interactions occurred
    if (state.currentResponseRate <= config.responseRateMin
      && (state.stats.mentionCount > 0 || state.stats.triggerWordCount > 0)) {
      return config.responseRateMax
    }

    let newRate = state.currentResponseRate
    newRate += state.stats.mentionCount * 100 // Mention multiplier
    newRate += state.stats.triggerWordCount * 50 // Trigger word multiplier
    newRate *= decayFactor

    return Math.min(Math.max(newRate, config.responseRateMin), config.responseRateMax)
  }

  const adjustResponseRate = () => {
    state.currentResponseRate = calculateNewResponseRate()

    // Reset counters
    state.stats.mentionCount = 0
    state.stats.triggerWordCount = 0
  }

  const checkCooldown = (chatId: string): boolean => {
    const now = Date.now()
    const lastResponse = state.lastResponseTimes.get(chatId) || 0
    return now - lastResponse >= config.cooldownMs
  }

  const checkTriggerWords = (text?: string): false | string => {
    if (!text || !config.triggerWords.length)
      return false
    return config.triggerWords.find(word => text.includes(word)) || false
  }

  const checkIgnoreWords = (text?: string): boolean => {
    if (!text || !config.ignoreWords.length)
      return false
    return config.ignoreWords.some(word => text.includes(word))
  }

  // Start decay timer
  const decayInterval = setInterval(() => {
    adjustResponseRate()
  }, config.decayCheckIntervalMs)

  // Public interface
  const handler = {
    // Cleanup function
    destroy() {
      clearInterval(decayInterval)
    },

    // Getters for current state
    getState() {
      return { ...state }
    },

    async shouldRespond(chatId: string, messages: Message[]): Promise<{ reason: string, responseRate?: number, shouldAct: boolean }> {
      const fromPrivate = messages.every(message => message.chat.type === 'private')
      const mentioned = messages.some(message => message.text?.includes(`@${bot.bot.botInfo.username}`))
      const reply = messages.some(message => message.reply_to_message?.from?.id.toString() === bot.bot.botInfo.id.toString())

      try {
        // Always respond to private messages
        if (fromPrivate) {
          state.stats.mentionCount++
          state.stats.lastInteractionTime = Date.now()
          return { reason: 'private_message', shouldAct: true }
        }

        if (mentioned || reply) {
          state.stats.mentionCount++
          state.stats.lastInteractionTime = Date.now()
          return { reason: 'mention_or_reply', shouldAct: true }
        }

        // Check trigger words
        const matchedTrigger = checkTriggerWords(messages.map(message => message.text).join(' '))
        if (matchedTrigger) {
          state.stats.triggerWordCount++
          state.stats.lastInteractionTime = Date.now()
          return { reason: `trigger_word:${matchedTrigger}`, shouldAct: true }
        }

        // Check cooldown
        if (!checkCooldown(chatId)) {
          return { reason: 'cooldown', shouldAct: false }
        }

        // Check ignore words
        if (checkIgnoreWords(messages.map(message => message.text).join(' '))) {
          return { reason: 'ignore_word', shouldAct: false }
        }

        // Random response based on current rate
        if (Math.random() < state.currentResponseRate) {
          state.lastResponseTimes.set(chatId, Date.now())
          return {
            reason: 'random',
            responseRate: state.currentResponseRate,
            shouldAct: true,
          }
        }

        return {
          reason: 'rate_check_failed',
          responseRate: state.currentResponseRate,
          shouldAct: false,
        }
      }
      catch (error) {
        bot.logger.withError(error).log('Error in attention handler')
        return { reason: 'error', shouldAct: false }
      }
    },
  }

  return handler
}
