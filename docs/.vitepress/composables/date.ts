import { isAfter, isBefore } from 'date-fns'

export function isBetweenHalloweenAndHalfOfNovember(date: Date) {
  const year = date.getFullYear()
  const halloween = new Date(year, 9, 25) // October 25
  const halfOfNovember = new Date(year, 10, 15) // November 15

  return isAfter(date, halloween) && isBefore(date, halfOfNovember)
}
