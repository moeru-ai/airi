function quoteField(field: unknown): string {
  return `"${String(field).replace(/"/g, '""')}"`
}

function toCsv(rows: Array<Array<unknown>>): string {
  return rows
    .map(row => row.map(quoteField).join(','))
    .join('\n')
}

export function exportCsv(rows: Array<Array<unknown>>, basename: string) {
  if (!rows.length)
    return

  if (typeof Blob === 'undefined' || typeof document === 'undefined' || typeof URL === 'undefined') {
    console.warn('[CSV] Export is only supported in browser environments')
    return
  }

  const csv = toCsv(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${basename}-${Date.now()}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
