import type { Page } from 'playwright'

import { SELECTORS } from '../../parsers/selectors'
import { logger } from '../../utils/logger'

/**
 * Scroll the page to load more tweets
 * @param page Playwright page instance
 * @param targetCount Target number of tweets to load
 * @param selector Tweet element selector
 */
export async function scrollToLoadMoreTweets(
  page: Page,
  targetCount: number,
  selector = SELECTORS.TIMELINE.TWEET,
): Promise<void> {
  try {
    // Initial tweet count
    let previousTweetCount = 0
    let currentTweetCount = await countVisibleElements(page, selector)
    let scrollAttempts = 0
    const maxScrollAttempts = 10

    logger.main.debug(`Initial tweet count: ${currentTweetCount}, target count: ${targetCount}`)

    // Scroll until we reach target count or max scroll attempts
    while (currentTweetCount < targetCount && scrollAttempts < maxScrollAttempts) {
      // Simulate mouse wheel scroll using Playwright
      await page.mouse.wheel(0, 800)

      // Wait for new content to load
      await page.waitForTimeout(1000)

      // Check for new tweets
      previousTweetCount = currentTweetCount
      currentTweetCount = await countVisibleElements(page, selector)

      // If no new tweets loaded, we may have reached the end
      if (currentTweetCount === previousTweetCount) {
        scrollAttempts++
      }
      else {
        scrollAttempts = 0 // Reset counter if tweets are still loading
      }

      logger.main.debug(`Scrolled to load more content: ${currentTweetCount}/${targetCount}`)
    }
  }
  catch (error) {
    logger.main.errorWithError('Error while scrolling to load more content:', (error as Error).message)
  }
}

/**
 * Count visible elements on the page
 * @param page Playwright page instance
 * @param selector Element selector
 */
export async function countVisibleElements(page: Page, selector: string): Promise<number> {
  const elements = await page.$$(selector)
  return elements.length
}
