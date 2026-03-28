export const POS_TIME_ZONE = 'America/Mexico_City'

function normalizeDateValue(value) {
  if (!value) return null
  if (value instanceof Date) return value

  const text = String(value).trim()
  if (!text) return null

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
    return new Date(text.replace(' ', 'T') + 'Z')
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(`${text}T12:00:00Z`)
  }

  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatDateTimeInPosTimeZone(value, locale = 'es-MX') {
  const date = normalizeDateValue(value)
  if (!date) return ''

  return new Intl.DateTimeFormat(locale, {
    timeZone: POS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date)
}

export function formatDateInputInPosTimeZone(value = new Date()) {
  const date = normalizeDateValue(value)
  if (!date) return ''

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: POS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${lookup.year}-${lookup.month}-${lookup.day}`
}
