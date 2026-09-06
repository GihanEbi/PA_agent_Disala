/**
 * Parses an RFC 5322 `From` header value, e.g. `"Priya Fernando" <priya@x.com>`
 * or a bare `priya@x.com`, into a display name and address.
 */
function parseFromHeader(raw: string): { name: string; email: string } {
  const match = raw.match(/^\s*(?:"?([^"<]*)"?\s*)?<([^>]+)>\s*$/)
  if (match) {
    const name = match[1]?.trim()
    return { name: name || match[2], email: match[2] }
  }
  return { name: raw.trim(), email: raw.trim() }
}

/**
 * First letter of up to the first two words of a display name. Falls back to
 * the first letter of an email address's local part when the name is itself
 * a bare address (no space to split into words).
 */
function getInitials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return "?"

  if (!trimmed.includes(" ") && trimmed.includes("@")) {
    return trimmed[0]!.toUpperCase()
  }

  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("")
}

export { parseFromHeader, getInitials }
