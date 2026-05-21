import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const frontendRoot = process.cwd()
const backendRoot = join(frontendRoot, '..', 'Emerald-Grove-Backend')

const libraryContent = readFileSync(join(frontendRoot, 'src/library/LibraryApp.tsx'), 'utf-8')
const aiPanelContent = readFileSync(join(frontendRoot, 'src/components/AiPanel.tsx'), 'utf-8')
const aiConstantsContent = readFileSync(
  join(backendRoot, 'src/main/java/com/emeraldgrove/constants/AiConstants.java'),
  'utf-8',
)
const groqConstantsContent = readFileSync(
  join(backendRoot, 'src/main/java/com/emeraldgrove/constants/GroqConstants.java'),
  'utf-8',
)
const aiResultDtoContent = readFileSync(
  join(backendRoot, 'src/main/java/com/emeraldgrove/dto/ai/AiResultDto.java'),
  'utf-8',
)

// ---------------------------------------------------------------------------
// Backend timing constants (parsed from source)
// ---------------------------------------------------------------------------

function extractIntConstant(source: string, name: string): number {
  const match = source.match(new RegExp(`${name}\\s*=\\s*(\\d+)`))
  if (!match) throw new Error(`Constant ${name} not found`)
  return parseInt(match[1], 10)
}

const SCHEDULED_INITIAL_DELAY_MS = extractIntConstant(aiConstantsContent, 'SCHEDULED_INITIAL_DELAY_MS')
const SCHEDULED_DELAY_MS = extractIntConstant(aiConstantsContent, 'SCHEDULED_DELAY_MS')
const GROQ_REQUEST_TIMEOUT_MS = 15_000 // from application.properties default
const CONNECT_TIMEOUT_SECONDS = extractIntConstant(groqConstantsContent, 'CONNECT_TIMEOUT_SECONDS')

// ---------------------------------------------------------------------------

describe('AI analysis — timing chain', () => {
  test('AiWorker initial delay is 5000 ms', () => {
    expect(SCHEDULED_INITIAL_DELAY_MS).toBe(5_000)
  })

  test('AiWorker polling interval is 3000 ms', () => {
    expect(SCHEDULED_DELAY_MS).toBe(3_000)
  })

  test('Groq connect timeout is 5 s', () => {
    expect(CONNECT_TIMEOUT_SECONDS).toBe(5)
  })

  test('worst-case analysis wait exceeds 20 s', () => {
    // Article saved → worker picks it up in at most initialDelay + one interval
    // → Groq processes in up to groqRequestTimeoutMs
    const worstCase = SCHEDULED_INITIAL_DELAY_MS + SCHEDULED_DELAY_MS + GROQ_REQUEST_TIMEOUT_MS
    expect(worstCase).toBeGreaterThan(20_000)
    // Document the value so failures are informative
    expect(worstCase).toBe(23_000)
  })
})

describe('AI analysis — frontend polling behavior', () => {
  test('loadAiForArticle fires only once per article (aiInitiated guard)', () => {
    expect(libraryContent).toMatch(/aiInitiated\.current\.has\(articleId\)/)
    expect(libraryContent).toMatch(/aiInitiated\.current\.add\(articleId\)/)
  })

  test('polling retries via setTimeout when status is PENDING', () => {
    expect(libraryContent).toMatch(/status\s*===\s*['"]PENDING['"][\s\S]{0,100}setTimeout/)
  })

  test('polling stops on DONE or FAILED (no infinite loop)', () => {
    expect(libraryContent).toMatch(/AI_POLL_MAX_ATTEMPTS/)
    expect(libraryContent).toMatch(/aiPollingArticleId\.current\s*=\s*null/)
  })

  test('polling interval constant is defined', () => {
    expect(libraryContent).toMatch(/AI_POLL_INTERVAL_MS\s*=\s*[\d_]+/)
    const match = libraryContent.match(/AI_POLL_INTERVAL_MS\s*=\s*([\d_]+)/)
    const intervalMs = match ? parseInt(match[1].replace(/_/g, ''), 10) : 0
    expect(intervalMs).toBeGreaterThanOrEqual(3_000)
  })

  test('polling timer is cleaned up on article switch', () => {
    expect(libraryContent).toMatch(/return\s*\(\)\s*=>\s*stopAiPolling\(\)/)
  })

  test('switching away from a PENDING article allows re-poll on return', () => {
    expect(libraryContent).toMatch(/aiInitiated\.current\.delete\(aiPollingArticleId\.current\)/)
  })
})

describe('AI analysis — token budget adequacy', () => {
  const MAX_COMPLETION_TOKENS_ANALYSIS = extractIntConstant(groqConstantsContent, 'MAX_COMPLETION_TOKENS_ANALYSIS')
  const MAX_COMPLETION_TOKENS_SUMMARY = extractIntConstant(groqConstantsContent, 'MAX_COMPLETION_TOKENS_SUMMARY')
  const SUMMARY_MAX_CHARS = 280 // from application.properties default

  test('MAX_COMPLETION_TOKENS_ANALYSIS is sufficient for a complete multilingual JSON response', () => {
    // A complete JSON response for a Russian-language article requires approximately:
    //   summary.detailed (5 sentences × ~400 chars): ~2000 chars ÷ 3 chars/token ≈  667 tokens
    //   keyPoints        (5 items × ~100 chars):     ~500  chars ÷ 3 chars/token ≈  167 tokens
    //   highlights       (3 items × ~300 chars):     ~900  chars ÷ 3 chars/token ≈  300 tokens
    //   JSON structural overhead:                                                  ≈  100 tokens
    //   ──────────────────────────────────────────────────────────────────────────────────────
    //   Minimum informative response total:                                        ≈ 1234 tokens
    //   Safety margin for longer content:                                          ≈ 1500 tokens
    //
    // Current value (1024) is insufficient — truncated JSON fails to parse in
    // AiOrchestrator.validate(), which silently returns an empty AiResultDto.
    const MINIMUM_SAFE_TOKENS = 1_500
    expect(MAX_COMPLETION_TOKENS_ANALYSIS).toBeGreaterThanOrEqual(MINIMUM_SAFE_TOKENS)
  })

  test('MAX_COMPLETION_TOKENS_SUMMARY covers the 280-char summary limit for non-Latin scripts', () => {
    // Cyrillic: ~3 chars/token → 280 chars ≈ 94 tokens needed minimum
    const minTokensNeeded = Math.ceil(SUMMARY_MAX_CHARS / 3)
    expect(MAX_COMPLETION_TOKENS_SUMMARY).toBeGreaterThanOrEqual(minTokensNeeded)
  })

  test('PROMPT_ANALYSIS requests a detailed summary of at least 3 sentences', () => {
    const match = groqConstantsContent.match(/PROMPT_ANALYSIS\s*=\s*"""([\s\S]*?)"""/)
    const promptBody = match?.[1] ?? ''
    expect(promptBody).toContain('"detailed"')
    expect(promptBody).toMatch(/3-\d sentences/i)
  })

  test('PROMPT_ANALYSIS requests at least 3 keyPoints', () => {
    const match = groqConstantsContent.match(/PROMPT_ANALYSIS\s*=\s*"""([\s\S]*?)"""/)
    const promptBody = match?.[1] ?? ''
    expect(promptBody).toMatch(/3.{1,10}keyPoints|keyPoints[^"]*3/i)
  })

  test('AiPanel renders summary.detailed (not just summary.short)', () => {
    expect(aiPanelContent).toMatch(/result\.summary\.detailed/)
  })

  test('AiPanel renders summary.short as primary summary text', () => {
    expect(aiPanelContent).toMatch(/result\.summary\.short/)
  })
})

describe('AI analysis — prompt schema matches AIResult type', () => {
  test('PROMPT_ANALYSIS schema includes keyPoints', () => {
    const match = groqConstantsContent.match(/PROMPT_ANALYSIS\s*=\s*"""([\s\S]*?)"""/)
    const promptBody = match?.[1] ?? ''
    expect(promptBody).toContain('keyPoints')
  })

  test('PROMPT_ANALYSIS schema includes highlights', () => {
    const match = groqConstantsContent.match(/PROMPT_ANALYSIS\s*=\s*"""([\s\S]*?)"""/)
    const promptBody = match?.[1] ?? ''
    expect(promptBody).toContain('highlights')
  })

  test('AiResultDto has keyPoints field', () => {
    expect(aiResultDtoContent).toContain('keyPoints')
  })

  test('AiResultDto has highlights field', () => {
    expect(aiResultDtoContent).toContain('highlights')
  })

  test('AiPanel renders keyPoints and highlights', () => {
    expect(aiPanelContent).toMatch(/result\.keyPoints/)
    expect(aiPanelContent).toMatch(/result\.highlights/)
  })
})
