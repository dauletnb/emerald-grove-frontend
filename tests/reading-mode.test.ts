import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const frontendRoot = process.cwd()

const libraryContent = readFileSync(join(frontendRoot, 'src/library/LibraryApp.tsx'), 'utf-8')
const aiPanelContent = readFileSync(join(frontendRoot, 'src/components/AiPanel.tsx'), 'utf-8')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countMatches(source: string, pattern: RegExp): number {
  return (source.match(pattern) ?? []).length
}

// ---------------------------------------------------------------------------

describe('Reading mode — tab visibility', () => {
  test('tab row is gated on selectedArticle.content being truthy', () => {
    expect(libraryContent).toMatch(/selectedArticle\.content[\s\S]{0,500}Заметки/)
  })

  test('"Заметки" tab sets readingMode to false', () => {
    expect(libraryContent).toMatch(/setReadingMode\(false\)[\s\S]{0,500}Заметки/)
  })

  test('"Читать" tab sets readingMode to true', () => {
    expect(libraryContent).toMatch(/setReadingMode\(true\)[\s\S]{0,500}Читать/)
  })

  test('readingMode resets to false on article switch', () => {
    expect(libraryContent).toMatch(/setReadingMode\(false\)/)
    expect(libraryContent).toMatch(/resolvedSelectedArticleId[\s\S]{0,200}setReadingMode\(false\)/)
  })
})

describe('Reading mode — article content visibility', () => {
  test('article content is hidden when AI status is DONE', () => {
    expect(libraryContent).toMatch(/status\s*!==\s*['"]DONE['"][\s\S]{0,200}article-content/)
  })

  test('article content is shown as fallback when AI is PENDING or FAILED', () => {
    // The condition `status !== 'DONE'` covers PENDING, FAILED, and undefined (no cache)
    const match = libraryContent.match(/aiCache\[selectedArticle\.id\]\?\.status\s*!==\s*['"]DONE['"]/)
    expect(match).not.toBeNull()
  })

  test('article content is sanitized with DOMPurify before rendering', () => {
    expect(libraryContent).toMatch(/DOMPurify\.sanitize\(selectedArticle\.content\)/)
  })

  test('article content uses dangerouslySetInnerHTML (no plain text rendering)', () => {
    expect(libraryContent).toMatch(/dangerouslySetInnerHTML[\s\S]{0,40}DOMPurify/)
  })
})

describe('Reading mode — AiPanel placement', () => {
  test('AiPanel is shown only when aiCache entry exists for the article', () => {
    expect(libraryContent).toMatch(/aiCache\[selectedArticle\.id\]\s*\?/)
  })

  test('AiPanel wrapper uses p-6 when DONE (no separator below)', () => {
    expect(libraryContent).toMatch(/=== 'DONE' \? 'p-6'/)
  })

  test('AiPanel wrapper has border separator when not DONE (content shown below)', () => {
    expect(libraryContent).toMatch(/border-b border-slate-100 px-6 py-4/)
  })
})

describe('Reading mode — AI retry behavior', () => {
  test('onRetry removes article from aiInitiated guard before re-polling', () => {
    expect(libraryContent).toMatch(/onRetry[\s\S]{0,80}aiInitiated\.current\.delete\(selectedArticle\.id\)/)
  })

  test('onRetry calls loadAiForArticle to restart polling', () => {
    expect(libraryContent).toMatch(/onRetry[\s\S]{0,120}loadAiForArticle\(selectedArticle\.id\)/)
  })

  test('onRetry does NOT delete aiCache entry (avoids UI flash between two setState calls)', () => {
    // Extract the onRetry callback body
    const onRetryMatch = libraryContent.match(/onRetry=\{[\s\S]{0,300}?loadAiForArticle\(selectedArticle\.id\)[\s\S]{0,60}\}\}/)
    expect(onRetryMatch).not.toBeNull()
    const onRetryBody = onRetryMatch![0]
    // Must NOT contain a setAiCache call that deletes the entry
    expect(onRetryBody).not.toMatch(/setAiCache/)
    expect(onRetryBody).not.toMatch(/delete next\[/)
  })

  test('onRetry is a minimal two-step handler: delete guard + reload', () => {
    const onRetryMatch = libraryContent.match(/onRetry=\{[\s\S]{0,300}?loadAiForArticle\(selectedArticle\.id\)[\s\S]{0,60}\}\}/)
    expect(onRetryMatch).not.toBeNull()
    const onRetryBody = onRetryMatch![0]
    // Should only have two distinct statements
    expect(countMatches(onRetryBody, /aiInitiated\.current\.delete/g)).toBe(1)
    expect(countMatches(onRetryBody, /loadAiForArticle/g)).toBe(1)
  })
})

describe('AiPanel — retry button availability', () => {
  test('retry button is rendered only in FAILED state', () => {
    expect(aiPanelContent).toMatch(/status\s*===\s*['"]FAILED['"][\s\S]{0,30}FailedState/)
    expect(aiPanelContent).toMatch(/onRetry\s*\?\s*\(/)
  })

  test('retry button is NOT shown for PENDING state', () => {
    expect(aiPanelContent).toMatch(/status\s*===\s*['"]PENDING['"][\s\S]{0,30}PendingState/)
    // PendingState component has no onRetry parameter
    expect(aiPanelContent).toMatch(/function PendingState\(\)/)
    expect(aiPanelContent).not.toMatch(/function PendingState\(\{[\s\S]*?onRetry/)
  })

  test('retry button is NOT shown for DONE state', () => {
    // DoneState only accepts { result }, not onRetry
    expect(aiPanelContent).toMatch(/function DoneState\(\{ result \}/)
    expect(aiPanelContent).not.toMatch(/function DoneState\([^)]*onRetry/)
  })
})
