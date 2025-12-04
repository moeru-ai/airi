export interface Env {
  DATABASE_URL: string
  AUTH_GOOGLE_CLIENT_ID: string
  AUTH_GOOGLE_CLIENT_SECRET: string
}

export function parseEnv(env: any): Env {
  return {
    DATABASE_URL: env.DATABASE_URL,
    AUTH_GOOGLE_CLIENT_ID: env.AUTH_GOOGLE_CLIENT_ID,
    AUTH_GOOGLE_CLIENT_SECRET: env.AUTH_GOOGLE_CLIENT_SECRET,
  }
}
