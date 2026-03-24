function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatLocalDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function formatLocalIsoWithoutTimezone(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function formatUtcOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absMinutes = Math.abs(offsetMinutes)
  const hours = Math.floor(absMinutes / 60)
  const minutes = absMinutes % 60
  return `${sign}${pad(hours)}:${pad(minutes)}`
}

export function buildOpenClawLocalTimeContextPrompt(now = new Date()): string {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'
  const utcOffset = formatUtcOffset(now)

  return [
    '## Local Time Context',
    '- Treat this section as the authoritative current local time for this machine.',
    `- Current local datetime: ${formatLocalDateTime(now)} (timezone: ${timezone}, UTC${utcOffset})`,
    `- Current local ISO datetime (no timezone suffix): ${formatLocalIsoWithoutTimezone(now)}`,
    `- Current unix timestamp (ms): ${now.getTime()}`,
    '- For relative time requests (e.g. "1 minute later", "tomorrow 9am"), compute from this local time unless the user specifies another timezone.',
    '- When calling `cron.add` with `schedule.kind: "at"`, send a future ISO 8601 timestamp with an explicit timezone offset.',
    '- Never send an `at` timestamp that is equal to or earlier than the current local time.',
  ].join('\n')
}
