import * as assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function run(name: string, fn: () => void) {
  fn()
  console.log(`PASS ${name}`)
}

// Use process.cwd() to get project root regardless of where test is compiled
const rootDir = process.cwd()
const articlesPath = join(rootDir, 'src/shared/api/articles.ts')
const collectionsPath = join(rootDir, 'src/shared/api/collections.ts')

const articlesContent = readFileSync(articlesPath, 'utf-8')
const collectionsContent = readFileSync(collectionsPath, 'utf-8')

run('Article sync endpoint uses new path /api/articles/sync', () => {
  assert.match(articlesContent, /\/api\/articles\/sync/)
  assert.doesNotMatch(articlesContent, /\/api\/sync\/articles/)
})

run('Article AI endpoint uses new path /api/ai/articles/{id}', () => {
  assert.match(articlesContent, /\/api\/ai\/articles\/\$\{encodeURIComponent\(articleId\)\}/)
  assert.doesNotMatch(articlesContent, /\/api\/articles\/\$\{encodeURIComponent\(articleId\)\}\/ai/)
})

run('Article deletions sync endpoint uses /api/articles/sync/deletions', () => {
  assert.match(articlesContent, /\/api\/articles\/sync\/deletions/)
})

run('Collection sync endpoint uses /api/collections/sync', () => {
  assert.match(collectionsContent, /\/api\/collections\/sync/)
  assert.doesNotMatch(collectionsContent, /\/api\/sync\/collections/)
})

run('Collection links sync endpoint uses /api/collections/sync/links', () => {
  assert.match(collectionsContent, /\/api\/collections\/sync\/links/)
  assert.doesNotMatch(collectionsContent, /\/api\/collections\/links\/sync/)
})

run('Collection deletions sync endpoint uses /api/collections/sync/deletions', () => {
  assert.match(collectionsContent, /\/api\/collections\/sync\/deletions/)
  assert.doesNotMatch(collectionsContent, /\/api\/sync\/collections\/deletions/)
})

run('Collection links deletions sync endpoint uses /api/collections/sync/links/deletions', () => {
  assert.match(collectionsContent, /\/api\/collections\/sync\/links\/deletions/)
  assert.doesNotMatch(collectionsContent, /\/api\/collections\/links\/sync\/deletions/)
})

console.log('\nAll API endpoint tests passed!')
