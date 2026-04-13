const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
})

export function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function getTodayDateKey(): string {
  return formatDateKey(new Date())
}

export function addDays(dateKey: string, amount: number): string {
  const nextDate = parseDateKey(dateKey)
  nextDate.setDate(nextDate.getDate() + amount)
  return formatDateKey(nextDate)
}

export function enumerateDateKeys(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  let currentDate = startDate

  while (currentDate <= endDate) {
    dates.push(currentDate)
    currentDate = addDays(currentDate, 1)
  }

  return dates
}

export function formatDisplayDate(dateKey: string): string {
  return DATE_LABEL_FORMATTER.format(parseDateKey(dateKey))
}

export function formatShortDate(dateKey: string): string {
  return SHORT_DATE_FORMATTER.format(parseDateKey(dateKey))
}

export function getRelativeDateLabel(dateKey: string): string {
  const today = getTodayDateKey()

  if (dateKey === today) {
    return 'Today'
  }

  if (dateKey === addDays(today, -1)) {
    return 'Yesterday'
  }

  if (dateKey === addDays(today, 1)) {
    return 'Tomorrow'
  }

  return formatDisplayDate(dateKey)
}

export function sortDatesAscending<T extends { date: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.date.localeCompare(right.date))
}

export function sortDatesDescending<T extends { date: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => right.date.localeCompare(left.date))
}

export function getRangeCutoff(days: number): string {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - (days - 1))
  return formatDateKey(cutoff)
}
