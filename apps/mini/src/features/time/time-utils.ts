export const PRODUCT_TIMEZONE = 'Asia/Shanghai'

export function productDayKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PRODUCT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  return `${year}-${month}-${day}`
}

export function productHour(value: Date | string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PRODUCT_TIMEZONE,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(typeof value === 'string' ? new Date(value) : value)
  return Number(parts.find((part) => part.type === 'hour')?.value ?? 0)
}

export function productDayRange(day: string) {
  const start = new Date(`${day}T00:00:00+08:00`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { from: start.toISOString(), to: end.toISOString() }
}

export function recentProductDays(today = new Date(), count = 7) {
  const [year, month, day] = productDayKey(today).split('-').map(Number)
  const start = Date.UTC(year, month - 1, day)
  return Array.from({ length: count }, (_, index) => new Date(start - index * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
}
