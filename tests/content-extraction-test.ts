import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { extractArticleFromDocument, extractCleanText } from '../src/content/extraction.ts'

function createDocument(html: string): Document {
  return new JSDOM(html).window.document
}

function shouldIgnoreNoisyNodesInFallbackDescription() {
  const document = createDocument(`
    <!doctype html>
    <html>
      <head>
        <title>History of patterns</title>
      </head>
      <body>
        <main>
          <article>
            <header>Top navigation text</header>
            <p>Useful article summary.</p>
            <script>window.__INITIAL_STATE__ = "noise"</script>
            <style>.hidden { display: none; }</style>
            <noscript>This should not leak.</noscript>
            <p>Second meaningful sentence.</p>
          </article>
        </main>
      </body>
    </html>
  `)

  const article = extractArticleFromDocument(document)

  assert.equal(article.title, 'History of patterns')
  assert.equal(article.description, 'Useful article summary. Second meaningful sentence.')
}

function shouldPreferMetaDescriptionWhenAvailable() {
  const document = createDocument(`
    <!doctype html>
    <html>
      <head>
        <title>Ignored title</title>
        <meta name="description" content="  Clean meta description wins.  " />
      </head>
      <body>
        <article>
          <p>Fallback text that should not be used.</p>
        </article>
      </body>
    </html>
  `)

  const article = extractArticleFromDocument(document)

  assert.equal(article.description, 'Clean meta description wins.')
}

function shouldDecodeHtmlEntitiesInMetaDescription() {
  const document = createDocument(`
    <!doctype html>
    <html>
      <head>
        <title>Encoded meta</title>
        <meta
          name="description"
          content="Главы из повести. Начало:&amp;nbsp;[ #01. Начало бизнеса ] &amp;mdash; тест."
        />
      </head>
      <body></body>
    </html>
  `)

  const article = extractArticleFromDocument(document)

  assert.equal(article.description, 'Главы из повести. Начало: [ #01. Начало бизнеса ] — тест.')
}

function shouldFallbackToBodyWhenNoArticleContainerExists() {
  const document = createDocument(`
    <!doctype html>
    <html>
      <head>
        <title>Body fallback</title>
      </head>
      <body>
        <div>Visible body text.</div>
        <script>console.log('ignore me')</script>
      </body>
    </html>
  `)

  assert.equal(extractCleanText(document.body), 'Visible body text.')
}

function run() {
  shouldIgnoreNoisyNodesInFallbackDescription()
  shouldPreferMetaDescriptionWhenAvailable()
  shouldDecodeHtmlEntitiesInMetaDescription()
  shouldFallbackToBodyWhenNoArticleContainerExists()
  console.log('content extraction regression tests passed')
}

run()
