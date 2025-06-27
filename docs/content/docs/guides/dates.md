---
title: Dates & Times
description: How to work with dates and times in Reka UI.
---

# Dates & Times

<Description>
How to work with dates and times in Reka UI.
</Description>

<Callout type="tip">

The inner-workings of our date-related components are heavily inspired by the research and work done
by the [React Aria](https://react-spectrum.adobe.com/react-aria/) team at Adobe, who have created
robust date components that excel in terms of accessibility, user experience, and flexibility.

</Callout>

The component depends on the [@internationalized/date](https://react-spectrum.adobe.com/internationalized/date/index.html) package, which solves a lot of the problems that come with working with dates and times in JavaScript.

We highly recommend reading through the documentation for the package to get a solid feel for how it
works, and you'll need to install it in your project to use the date-related components.

<InstallationTabs value="@internationalized/date" />

## Date Objects

We use the `DateValue` objects provided by `@internationalized/date` to
represent dates in the various components. These objects are immutable, and provide information about
the type of date they represent:

- `CalendarDate`: A date with no time component, such as `2023-10-11`.
- `CalendarDateTime`: A date with a time component, but without a timezone, such as
  `2023-10-11T12:30:00`.
- `ZonedDateTime`: A date with a time component and a timezone, such as
  `2023-10-11T21:00:00:00-04:00[America/New_York]`.

The benefit of using these objects is that we can be very specific about the type of date we want,
and the behavior of the builder will adapt to that type.

Additionally, you don't have to worry about wrangling timezones, daylight savings time, or any other
date-related nuance.

## Utility Functions

This package also provides a number of utility functions which solves a lot of the problems that come with working with dates and times in JavaScript.

Specially designed to work well with [@internationalized/date](https://react-spectrum.adobe.com/internationalized/date/index.html).

### How to use?

```ts
import type { DateValue } from '@internationalized/date'

import { CalendarDate } from '@internationalized/date'
import {
  createDateRange,
  createDecade,
  createMonth,
  createYear,
  createYearRange,
  getDaysInMonth,
  hasTime,
  isAfter,
  isAfterOrSame,
  isBefore,
  isBeforeOrSame,
  isBetween,
  isBetweenInclusive,
  isCalendarDateTime,
  isZonedDateTime,
  parseStringToDateValue,
  toDate,
} from 'reka-ui/date'

const date = new CalendarDate(1995, 8, 18)
const minDate = new CalendarDate(1995, 8, 1)
const maxDate = new CalendarDate(1995, 8, 31)

parseStringToDateValue('1995-08-18', date) // returns a DateValue object
toDate(date) // returns a Date object
isCalendarDateTime(date) // returns false
isZonedDateTime(date) // returns false
hasTime(date) // returns false
getDaysInMonth(date) // returns 31
isAfter(date, minDate) // returns true
isBeforeOrSame(date, maxDate) // returns true
isAfterOrSame(date, minDate) // returns true
isBefore(date, maxDate) // returns true
isBetweenInclusive(date, minDate, maxDate) // returns true
isBetween(date, minDate, maxDate) // returns true
createMonth({ dateObj: new CalendarDate(1995, 8, 18), weekStartsOn: 0, locale: 'en', fixedWeeks: true }) // returns a grid of days as DateValue for the month, also containing the dateObj, plus an array of days for the month
createYear({ dateObj: new CalendarDate(1995, 8, 18), numberOfMonths: 2, pagedNavigation: true }) // returns an array of months as DateValue, centered around the dateObj taking into account the numberOfMonths and pagedNavigation when returning the months
createDecade({ dateObj: new CalendarDate(1995, 8, 18), startIndex: -10, endIndex: 10 }) // returns a decade centered around the dateObj
createDateRange({ start: new CalendarDate(1995, 8, 18), end: new CalendarDate(2005, 8, 18) }) // returns an array of dates as DateValue between the start and end date
createYearRange({ start: new CalendarDate(1995, 8, 18), end: new CalendarDate(2005, 8, 18) }) // returns an array of years as DateValue between the start and end date
```
