/**
 * Twitter 网站 CSS 选择器常量
 * 用于定位页面上的元素
 */
export const SELECTORS = {
  LOGIN: {
    USERNAME_INPUT: 'input[autocomplete="username"]',
    PASSWORD_INPUT: 'input[type="password"]',
    NEXT_BUTTON: '[data-testid="auth-login-button"]',
    LOGIN_BUTTON: '[data-testid="LoginForm_Login_Button"]',
  },
  HOME: {
    TIMELINE: '[data-testid="primaryColumn"]',
  },
  TIMELINE: {
    TWEET: '[data-testid="tweet"]',
    TWEET_TEXT: '[data-testid="tweetText"]',
    TWEET_TIME: 'time',
    LIKE_BUTTON: '[data-testid="like"]',
    RETWEET_BUTTON: '[data-testid="retweet"]',
    REPLY_BUTTON: '[data-testid="reply"]',
  },
  PROFILE: {
    FOLLOW_BUTTON: '[data-testid="followButton"]',
    UNFOLLOW_BUTTON: '[data-testid="unfollowButton"]',
    DISPLAY_NAME: '[data-testid="UserName"]',
    BIO: '[data-testid="UserDescription"]',
    STATS: '[data-testid="UserProfileStats"]',
  },
  COMPOSE: {
    TWEET_INPUT: '[data-testid="tweetTextarea_0"]',
    TWEET_BUTTON: '[data-testid="tweetButtonInline"]',
    MEDIA_BUTTON: '[data-testid="imageOrGifButton"]',
  },
}
