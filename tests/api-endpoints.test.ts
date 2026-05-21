import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const rootDir = process.cwd()
const articlesContent = readFileSync(join(rootDir, 'src/shared/api/articles.ts'), 'utf-8')
const collectionsContent = readFileSync(join(rootDir, 'src/shared/api/collections.ts'), 'utf-8')

describe('API endpoint paths', () => {
  test('article sync uses /api/articles/sync', () => {
    expect(articlesContent).toMatch(/\/api\/articles\/sync/)
    expect(articlesContent).not.toMatch(/\/api\/sync\/articles/)
  })

  test('article AI endpoint uses /api/ai/articles/{id}', () => {
    expect(articlesContent).toMatch(/\/api\/ai\/articles\/\$\{encodeURIComponent\(articleId\)\}/)
    expect(articlesContent).not.toMatch(/\/api\/articles\/\$\{encodeURIComponent\(articleId\)\}\/ai/)
  })

  test('article deletions sync uses /api/articles/sync/deletions', () => {
    expect(articlesContent).toMatch(/\/api\/articles\/sync\/deletions/)
  })

  test('collection sync uses /api/collections/sync', () => {
    expect(collectionsContent).toMatch(/\/api\/collections\/sync/)
    expect(collectionsContent).not.toMatch(/\/api\/sync\/collections/)
  })

  test('collection links sync uses /api/collections/sync/links', () => {
    expect(collectionsContent).toMatch(/\/api\/collections\/sync\/links/)
    expect(collectionsContent).not.toMatch(/\/api\/collections\/links\/sync/)
  })

  test('collection deletions sync uses /api/collections/sync/deletions', () => {
    expect(collectionsContent).toMatch(/\/api\/collections\/sync\/deletions/)
    expect(collectionsContent).not.toMatch(/\/api\/sync\/collections\/deletions/)
  })

  test('collection links deletions uses /api/collections/sync/links/deletions', () => {
    expect(collectionsContent).toMatch(/\/api\/collections\/sync\/links\/deletions/)
    expect(collectionsContent).not.toMatch(/\/api\/collections\/links\/sync\/deletions/)
  })
})
