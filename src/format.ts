// Date helpers shared by the shell and the session views. They lived inside
// App.tsx until the component split gave them more than one consumer.

export function formatDate(value: string) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`))
}

/**
 * A Date as `YYYY-MM-DD` in the browser's own timezone. `toISOString` is wrong
 * here: it converts to UTC first, which shifts the date either side of midnight.
 */
export function isoDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

export function localToday() {
  return isoDate(new Date())
}
