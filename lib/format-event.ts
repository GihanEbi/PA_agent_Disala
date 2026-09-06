const MAX_VISIBLE_ATTENDEES = 2

type AttendeeLike = { email: string; displayName?: string }

/**
 * Builds the single subtitle line the calendar list shows under an event's
 * title, e.g. "Priya Fernando, Zoom" — attendee names (falling back to
 * email), capped so a large meeting doesn't blow out the line, then the
 * location if present. Returns "" when there's nothing to show.
 */
function formatAttendeesLine(event: { attendees: AttendeeLike[]; location: string }): string {
  const names = event.attendees.map((attendee) => attendee.displayName || attendee.email)
  const visible = names.slice(0, MAX_VISIBLE_ATTENDEES)
  const remaining = names.length - visible.length

  const parts = [...visible]
  if (remaining > 0) parts.push(`+${remaining} more`)
  if (event.location) parts.push(event.location)

  return parts.join(", ")
}

export { formatAttendeesLine }
