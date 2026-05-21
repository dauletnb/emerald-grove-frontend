import { describe, test, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { extractWithReadability, normalizeText } from '../src/content/extraction'

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

describe('normalizeText', () => {
  test('collapses whitespace and trims', () => {
    expect(normalizeText('  hello   world  ')).toBe('hello world')
    expect(normalizeText('foo\u00A0bar')).toBe('foo bar')
    expect(normalizeText('  \n  ')).toBe('')
    expect(normalizeText('already clean')).toBe('already clean')
  })

  test('replaces non-breaking spaces', () => {
    expect(normalizeText('word\u00A0word\u00A0word')).toBe('word word word')
  })
})

describe('extractWithReadability', () => {
  test('always returns strings for all fields', () => {
    const result = extractWithReadability(makeDoc(RICH_ARTICLE_HTML))
    expect(typeof result.title).toBe('string')
    expect(typeof result.content).toBe('string')
    expect(typeof result.excerpt).toBe('string')
  })

  test('extracts article title', () => {
    const result = extractWithReadability(makeDoc(RICH_ARTICLE_HTML))
    expect(result.title.length).toBeGreaterThan(0)
    expect(result.title.toLowerCase()).toContain('javascript')
  })

  test('extracts article body content', () => {
    const result = extractWithReadability(makeDoc(RICH_ARTICLE_HTML))
    expect(result.content.length).toBeGreaterThan(0)
    expect(result.content).toContain('JavaScript')
  })

  test('strips nav and footer from content', () => {
    const result = extractWithReadability(makeDoc(RICH_ARTICLE_HTML))
    expect(result.content).not.toContain('Site navigation')
    expect(result.content).not.toContain('Footer content')
  })

  test('returns No Title fallback when title is missing', () => {
    const doc = makeDoc(`
      <!DOCTYPE html>
      <html><head></head>
      <body><p>Some content without a title element at all.</p></body>
      </html>
    `)
    const result = extractWithReadability(doc)
    expect(typeof result.title).toBe('string')
    expect(result.title.length).toBeGreaterThan(0)
  })

  test('does not mutate the original document', () => {
    const doc = makeDoc(RICH_ARTICLE_HTML)
    const titleBefore = doc.querySelector('title')?.textContent
    extractWithReadability(doc)
    expect(doc.querySelector('title')?.textContent).toBe(titleBefore)
    expect(doc.querySelector('nav')).not.toBeNull()
  })

  test('handles null result from Readability parser', () => {
    const doc = makeDoc(`
      <!DOCTYPE html>
      <html><head><title>Empty</title></head>
      <body></body>
      </html>
    `)
    const result = extractWithReadability(doc)
    expect(typeof result.title).toBe('string')
    expect(typeof result.content).toBe('string')
    expect(typeof result.excerpt).toBe('string')
    expect(result.content).toBe('')
  })
})
