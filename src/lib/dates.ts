const DAY_MS = 86_400_000

/** Converte 'YYYY-MM-DD' em número de dias desde 1970-01-01 (UTC). */
export function toDay(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS)
}

export function fromDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

/** Dia de hoje (fuso local) como número de dias. */
export function todayDay(): number {
  const d = new Date()
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS)
}

export function todayISO(): string {
  return fromDay(todayDay())
}

export function dayOfMonth(day: number): number {
  return new Date(day * DAY_MS).getUTCDate()
}

/** 0 = domingo ... 6 = sábado */
export function weekday(day: number): number {
  return (((day + 4) % 7) + 7) % 7
}

export function isWeekend(day: number): boolean {
  const w = weekday(day)
  return w === 0 || w === 6
}

export function monthKey(day: number): string {
  const d = new Date(day * DAY_MS)
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`
}

export function monthLabel(day: number, withYear: boolean): string {
  const d = new Date(day * DAY_MS)
  const m = d.toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' })
  const cap = m.charAt(0).toUpperCase() + m.slice(1)
  return withYear ? `${cap} ${d.getUTCFullYear()}` : cap
}

export function formatBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function durationDays(start: string, end: string): number {
  return toDay(end) - toDay(start) + 1
}

export function shiftISO(iso: string, delta: number): string {
  return fromDay(toDay(iso) + delta)
}
