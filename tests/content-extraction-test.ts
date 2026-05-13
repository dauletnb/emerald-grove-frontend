import * as assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { extractWithReadability, normalizeText } from '../src/content/extraction'

function run(name: string, fn: () => void) {
  fn()
  console.log(`PASS ${name}`)
}

function makeDoc(html: string): Document {
  const dom = new JSDOM(html, { url: 'https://example.com' })
  return dom.window.document as unknown as Document
}

const RICH_ARTICLE_HTML = `
  <!DOCTYPE html>
  <html lang="en">
  <head><title>How JavaScript Works</title></head>
  <body>
    <nav>Site navigation — should be stripped</nav>
    <article>
      <h1>How JavaScript Works</h1>
      <p>JavaScript is a lightweight, interpreted programming language with first-class functions.</p>
      <p>It is most well known as the scripting language for Web pages, but it is also used in
         many non-browser environments such as Node.js and Apache CouchDB.</p>
      <p>JavaScript is a prototype-based, multi-paradigm, single-threaded, dynamic language,
         supporting object-oriented, imperative, and declarative programming styles.</p>
      <p>The standards for JavaScript are the ECMAScript Language Specification and the
         ECMAScript Internationalization API Specification.</p>
      <p>As a multi-paradigm language, JavaScript supports event-driven, functional, and
         imperative programming styles. It has application programming interfaces (APIs)
         for working with text, dates, regular expressions, standard data structures,
         and the Document Object Model (DOM).</p>
    </article>
    <footer>Footer content — should be stripped</footer>
  </body>
  </html>
`

run('normalizeText collapses whitespace and trims', () => {
  assert.equal(normalizeText('  hello   world  '), 'hello world')
  assert.equal(normalizeText('foo\u00A0bar'), 'foo bar')
  assert.equal(normalizeText('  \n  '), '')
  assert.equal(normalizeText('already clean'), 'already clean')
})

run('normalizeText replaces non-breaking spaces', () => {
  const input = 'word\u00A0word\u00A0word'
  assert.equal(normalizeText(input), 'word word word')
})

run('extractWithReadability always returns strings for all fields', () => {
  const doc = makeDoc(RICH_ARTICLE_HTML)
  const result = extractWithReadability(doc)

  assert.equal(typeof result.title, 'string')
  assert.equal(typeof result.content, 'string')
  assert.equal(typeof result.excerpt, 'string')
})

run('extractWithReadability extracts article title', () => {
  const doc = makeDoc(RICH_ARTICLE_HTML)
  const result = extractWithReadability(doc)

  assert.ok(result.title.length > 0, 'title must not be empty')
  assert.ok(
    result.title.toLowerCase().includes('javascript'),
    `expected title to contain "javascript", got: "${result.title}"`,
  )
})

run('extractWithReadability extracts article body content', () => {
  const doc = makeDoc(RICH_ARTICLE_HTML)
  const result = extractWithReadability(doc)

  assert.ok(result.content.length > 0, 'content must not be empty')
  assert.ok(
    result.content.includes('JavaScript'),
    'content should include article text',
  )
})

run('extractWithReadability strips nav and footer from content', () => {
  const doc = makeDoc(RICH_ARTICLE_HTML)
  const result = extractWithReadability(doc)

  assert.ok(
    !result.content.includes('Site navigation'),
    'content must not include nav text',
  )
  assert.ok(
    !result.content.includes('Footer content'),
    'content must not include footer text',
  )
})

run('extractWithReadability returns No Title fallback when title is missing', () => {
  const doc = makeDoc(`
    <!DOCTYPE html>
    <html><head></head>
    <body><p>Some content without a title element at all.</p></body>
    </html>
  `)
  const result = extractWithReadability(doc)

  assert.equal(typeof result.title, 'string')
  assert.ok(result.title.length > 0, 'title must have a fallback value')
})

run('extractWithReadability does not mutate the original document', () => {
  const doc = makeDoc(RICH_ARTICLE_HTML)
  const titleBefore = doc.querySelector('title')?.textContent

  extractWithReadability(doc)

  const titleAfter = doc.querySelector('title')?.textContent
  assert.equal(titleBefore, titleAfter, 'original document title must be unchanged')

  assert.ok(
    doc.querySelector('nav') !== null,
    'original document nav must still be present after extraction',
  )
})
