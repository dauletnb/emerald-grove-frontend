import { describe, test, expect } from 'vitest'
import { toOfflineArticle } from '../src/shared/api/articles'

// ─── helpers ───────────────────────────────────────────────────────────────────

const MILLIS_2025 = 1_737_000_000_000 // ~Jan 2025 in ms
const SECONDS_2025 = 1_737_000_000    // ~Jan 2025 in seconds
const MILLIS_1970_LIMIT = 86_400_000  // 1 day in ms (dates below this look like 1970)

function makeRemoteArticle(noteCreatedAt: number | null) {
  return {
    articleId: 1,
    externalId: 'article-1',
    url: 'https://example.com',
    title: 'Test Article',
    description: 'desc',
    content: 'body',
    isFavorite: false,
    isReadLater: false,
    createdAt: MILLIS_2025,
    updatedAt: MILLIS_2025,
    notes: [
      {
        id: 'note-1',
        type: 'IDEA' as const,
        content: 'Hello',
        createdAt: noteCreatedAt,
      },
    ],
  }
}

// ─── toOfflineArticle: note date mapping ───────────────────────────────────────

describe('toOfflineArticle — note date handling', () => {
  test('preserves note createdAt when value is in milliseconds', () => {
    const result = toOfflineArticle(makeRemoteArticle(MILLIS_2025))
    const note = result.notes[0]

    expect(note.createdAt).toBe(MILLIS_2025)

    const date = new Date(note.createdAt)
    expect(date.getFullYear()).toBeGreaterThanOrEqual(2025)
  })

  test('normalizes epoch seconds from backend to milliseconds', () => {
    // Backend (Java) may return epoch seconds (e.g. Instant.getEpochSecond()).
    // normalizeTimestamp should auto-detect and multiply by 1000.
    const result = toOfflineArticle(makeRemoteArticle(SECONDS_2025))
    const note = result.notes[0]

    expect(note.createdAt).toBe(SECONDS_2025 * 1000)

    const date = new Date(note.createdAt)
    expect(date.getFullYear()).toBeGreaterThanOrEqual(2024)
  })

  test('note createdAt should never resolve to a 1970 date', () => {
    const result = toOfflineArticle(makeRemoteArticle(SECONDS_2025))
    const note = result.notes[0]

    expect(note.createdAt).toBeGreaterThan(MILLIS_1970_LIMIT)

    const date = new Date(note.createdAt)
    expect(date.getFullYear()).toBeGreaterThan(2000)
  })

  test('falls back to Date.now() when createdAt is null', () => {
    const before = Date.now()
    const result = toOfflineArticle(makeRemoteArticle(null))
    const after = Date.now()
    const note = result.notes[0]

    expect(note.createdAt).toBeGreaterThanOrEqual(before)
    expect(note.createdAt).toBeLessThanOrEqual(after)
  })

  test('article-level createdAt is also in milliseconds', () => {
    const result = toOfflineArticle(makeRemoteArticle(MILLIS_2025))

    expect(result.createdAt).toBe(MILLIS_2025)
    expect(new Date(result.createdAt).getFullYear()).toBeGreaterThanOrEqual(2025)
  })
})

// ─── sync payload: note dates sent to server ────────────────────────────────

describe('sync payload — note dates sent to server', () => {
  test('note createdAt in OfflineArticle is a positive millisecond timestamp', () => {
    const result = toOfflineArticle(makeRemoteArticle(MILLIS_2025))
    const note = result.notes[0]

    // Must be a number, positive, and look like ms (> 1e12)
    expect(typeof note.createdAt).toBe('number')
    expect(note.createdAt).toBeGreaterThan(1e12)
  })

  test('multiple notes each retain their own createdAt', () => {
    const ts1 = MILLIS_2025
    const ts2 = MILLIS_2025 + 60_000 // +1 min

    const remote = {
      ...makeRemoteArticle(ts1),
      notes: [
        { id: 'n1', type: 'IDEA' as const, content: 'first', createdAt: ts1 },
        { id: 'n2', type: 'IDEA' as const, content: 'second', createdAt: ts2 },
      ],
    }

    const result = toOfflineArticle(remote)
    expect(result.notes[0].createdAt).toBe(ts1)
    expect(result.notes[1].createdAt).toBe(ts2)
    expect(result.notes[1].createdAt - result.notes[0].createdAt).toBe(60_000)
  })
})

// ─── formatDate with normalizeTimestamp (mirrors LibraryApp.tsx logic) ───────

describe('formatDate with normalizeTimestamp', () => {
  function normalizeTimestamp(value: number): number {
    return value < 1e12 ? value * 1000 : value
  }

  function formatDate(value: number) {
    return new Date(normalizeTimestamp(value)).toLocaleString('ru-RU', {
      timeZone: 'Asia/Almaty',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  }

  test('millisecond timestamp produces a readable Almaty date', () => {
    const result = formatDate(MILLIS_2025)
    expect(result).toMatch(/2025/)
    // Should use DD.MM.YYYY format
    expect(result).toMatch(/\d{2}\.\d{2}\.\d{4}/)
    // Should NOT contain AM/PM
    expect(result).not.toMatch(/AM|PM/i)
  })

  test('second timestamp is auto-corrected and does NOT produce 1970', () => {
    const result = formatDate(SECONDS_2025)
    expect(result).toMatch(/2025/)
    expect(result).not.toMatch(/1970/)
  })

  test('uses 24-hour format', () => {
    // 15:00 UTC = 20:00 Almaty
    const ts = Date.UTC(2025, 5, 15, 15, 30, 0)
    const result = formatDate(ts)
    expect(result).toMatch(/20:30:00/)
    expect(result).not.toMatch(/AM|PM/i)
  })
})
