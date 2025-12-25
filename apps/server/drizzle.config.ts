import process from 'node:process'

export default {
  schema: './src/schemas/**/*.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
}
