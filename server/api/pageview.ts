const startAt = Date.now()
let count = 0

export default defineEventHandler(() => ({
  pageview: count++,
  startAt,
}))
