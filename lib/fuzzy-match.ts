import "server-only"

/** A close-but-not-exact match returned to a caller alongside its similarity score. */
type FuzzyMatch<T> = { item: T; score: number }

/** First-pass tuning constants — easy to revisit once there's real usage data. */
const FUZZY_MATCH_THRESHOLD = 0.55
const FUZZY_MATCH_LIMIT = 3

function levenshteinDistance(a: string, b: string) {
  const rows = a.length + 1
  const cols = b.length + 1
  const distances: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0))

  for (let i = 0; i < rows; i++) distances[i][0] = i
  for (let j = 0; j < cols; j++) distances[0][j] = j

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      distances[i][j] = Math.min(
        distances[i - 1][j] + 1,
        distances[i][j - 1] + 1,
        distances[i - 1][j - 1] + cost
      )
    }
  }

  return distances[rows - 1][cols - 1]
}

/** Normalized similarity in [0, 1] — 1 means identical, 0 means completely different. */
function similarity(a: string, b: string) {
  const left = a.trim().toLowerCase()
  const right = b.trim().toLowerCase()
  if (left.length === 0 && right.length === 0) return 1
  const maxLength = Math.max(left.length, right.length)
  if (maxLength === 0) return 1
  return 1 - levenshteinDistance(left, right) / maxLength
}

/**
 * Scores every candidate against `query` using one or more text fields
 * (`getTexts`), keeps the candidate's own best-matching field, filters out
 * anything below `threshold`, and returns the top `limit` by score.
 */
function findFuzzyMatches<T>(
  query: string,
  candidates: T[],
  getTexts: (item: T) => (string | null | undefined)[],
  { threshold = FUZZY_MATCH_THRESHOLD, limit = FUZZY_MATCH_LIMIT } = {}
): FuzzyMatch<T>[] {
  const scored = candidates.map((item) => {
    const texts = getTexts(item).filter((text): text is string => Boolean(text && text.trim()))
    const score = texts.reduce((best, text) => Math.max(best, similarity(query, text)), 0)
    return { item, score }
  })

  return scored
    .filter(({ score }) => score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export { levenshteinDistance, similarity, findFuzzyMatches, FUZZY_MATCH_THRESHOLD, FUZZY_MATCH_LIMIT }
export type { FuzzyMatch }
