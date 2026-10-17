// Days travel as YYYY-MM-DD strings in the device's time zone.
export const localDay = (d: Date) => d.toLocaleDateString('en-CA')
export const asDate = (day: string) => new Date(`${day}T12:00`) // noon dodges DST edges when parsing

export function addDays(day: string, n: number) {
  const d = asDate(day)
  d.setDate(d.getDate() + n)
  return localDay(d)
}

/** Monday of the week that holds day. */
export const mondayOf = (day: string) => addDays(day, -((asDate(day).getDay() + 6) % 7))
