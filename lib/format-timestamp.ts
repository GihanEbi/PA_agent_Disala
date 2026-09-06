function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * Matches the sample data's style: "Today, 9:12 PM" / "Yesterday, 6:03 PM" /
 * a weekday name within the last 7 days / a short date beyond that.
 */
function formatNoteTimestamp(date: Date, now: Date = new Date()) {
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })

  if (isSameDay(date, now)) {
    return `Today, ${time}`
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(date, yesterday)) {
    return `Yesterday, ${time}`
  }

  const daysAgo = Math.round((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (daysAgo < 7) {
    return `${date.toLocaleDateString("en-US", { weekday: "long" })}, ${time}`
  }

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/**
 * Matches the mail list's convention: today shows only a time ("8:41 AM"),
 * yesterday shows "Yesterday", the rest of the last week shows a weekday
 * name, and anything older shows a short date — never a stale mixed format.
 */
function formatEmailTimestamp(date: Date, now: Date = new Date()) {
  if (isSameDay(date, now)) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(date, yesterday)) {
    return "Yesterday"
  }

  const daysAgo = Math.round((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (daysAgo < 7) {
    return date.toLocaleDateString("en-US", { weekday: "long" })
  }

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export { formatNoteTimestamp, formatEmailTimestamp }
