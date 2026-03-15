import path from 'node:path'
import process from 'node:process'

export const TWITTER_BASE_URL = 'https://x.com'
export const TWITTER_LOGIN_URL = `${TWITTER_BASE_URL}/login`
export const TWITTER_HOME_URL = `${TWITTER_BASE_URL}/home`
export const TWITTER_SEARCH_URL = `${TWITTER_BASE_URL}/search`
export const TWITTER_USER_URL = `${TWITTER_BASE_URL}/user`
export const TWITTER_USER_PROFILE_URL = `${TWITTER_BASE_URL}/user/profile`
export const TWITTER_SESSION_FILE = path.join(process.cwd(), 'data', 'twitter-session.json')
