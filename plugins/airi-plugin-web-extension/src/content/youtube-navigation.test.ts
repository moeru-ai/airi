import { describe, expect, it } from 'vitest'

import { getYouTubeNavigation } from './youtube-navigation'

describe('getYouTubeNavigation', () => {
  it('is ready on a watch page when the watch page shows the video of the URL', () => {
    expect(getYouTubeNavigation({
      url: 'https://www.youtube.com/watch?v=b',
      watchVideoId: 'b',
      pageDataUpdated: true,
    })).toEqual({ id: 'b', phase: 'ready' })
  })

  it('is changing on a watch page while the watch page still shows the previous video', () => {
    expect(getYouTubeNavigation({
      url: 'https://www.youtube.com/watch?v=b',
      watchVideoId: 'a',
      pageDataUpdated: true,
    })).toEqual({ id: 'b', phase: 'changing' })
  })

  it('is changing on a Short until the page data arrives', () => {
    const state = { url: 'https://www.youtube.com/shorts/s1', watchVideoId: 'a' }

    expect(getYouTubeNavigation({ ...state, pageDataUpdated: false })).toEqual({ id: 's1', phase: 'changing' })
    expect(getYouTubeNavigation({ ...state, pageDataUpdated: true })).toEqual({ id: 's1', phase: 'ready' })
  })

  it('ignores the mini player video on a Short', () => {
    expect(getYouTubeNavigation({
      url: 'https://www.youtube.com/shorts/s1',
      watchVideoId: 'a',
      pageDataUpdated: true,
    })?.id).toBe('s1')
  })

  it('has no navigation on a page without a video', () => {
    expect(getYouTubeNavigation({ url: 'https://www.youtube.com/', pageDataUpdated: true })).toBeUndefined()
    expect(getYouTubeNavigation({ url: 'not a url', pageDataUpdated: true })).toBeUndefined()
  })
})
