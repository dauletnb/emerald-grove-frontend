import { openDB, IDBPDatabase } from 'idb'
import type { ArticleNote, NoteType } from '../types'

export interface OfflineArticle {
  id: string
  title: string
  url: string
  description: string
  createdAt: number
  updatedAt?: number
  syncStatus: 'SYNCED' | 'PENDING_SYNC'
  notes: ArticleNote[]
}

function normalizeArticle(article: OfflineArticle): OfflineArticle {
  return {
    ...article,
    description: article.description ?? '',
    createdAt: article.createdAt ?? Date.now(),
    updatedAt: article.updatedAt ?? article.createdAt ?? Date.now(),
    notes: article.notes ?? [],
  }
}

export const dbPromise = openDB('emerald-grove-db', 1, {
  upgrade(db: IDBPDatabase) {
    if (!db.objectStoreNames.contains('articles')) {
      db.createObjectStore('articles', { keyPath: 'id' })
    }
  },
})

async function findMatchingArticle(article: Pick<OfflineArticle, 'id' | 'url'>): Promise<OfflineArticle | undefined> {
  const db = await dbPromise
  const articles = await db.getAll('articles')

  return articles.find((storedArticle) => storedArticle.id === article.id || storedArticle.url === article.url)
}

export async function saveArticleOffline(article: OfflineArticle): Promise<OfflineArticle> {
  const db = await dbPromise
  const existingArticle = await findMatchingArticle(article)
  const normalizedArticle = normalizeArticle({
    ...existingArticle,
    ...article,
    id: article.id,
    url: article.url,
    notes: article.notes ?? existingArticle?.notes ?? [],
  })

  if (existingArticle && existingArticle.id !== normalizedArticle.id) {
    await db.delete('articles', existingArticle.id)
  }

  await db.put('articles', normalizedArticle)
  return normalizedArticle
}

export async function saveArticlesOffline(articles: OfflineArticle[]): Promise<void> {
  for (const article of articles) {
    await saveArticleOffline(article)
  }
}

export async function getAllArticles(): Promise<OfflineArticle[]> {
  const db = await dbPromise
  const articles = await db.getAll('articles')

  return articles
    .map((article) => normalizeArticle(article))
    .sort((left, right) => (right.updatedAt ?? right.createdAt) - (left.updatedAt ?? left.createdAt))
}

export async function getArticleById(id: string): Promise<OfflineArticle | undefined> {
  const db = await dbPromise
  const article = await db.get('articles', id)
  return article ? normalizeArticle(article) : undefined
}

export async function deleteArticle(id: string): Promise<void> {
  const db = await dbPromise
  await db.delete('articles', id)
}

export async function markArticleSyncStatus(
  articleId: string,
  syncStatus: OfflineArticle['syncStatus'],
): Promise<OfflineArticle> {
  const article = await getArticleById(articleId)

  if (!article) {
    throw new Error('Article not found')
  }

  return saveArticleOffline({
    ...article,
    syncStatus,
    updatedAt: Date.now(),
  })
}

export async function deleteArticleNote(articleId: string, noteId: string): Promise<OfflineArticle> {
  const article = await getArticleById(articleId)

  if (!article) {
    throw new Error('Article not found')
  }

  return saveArticleOffline({
    ...article,
    notes: article.notes.filter((note) => note.id !== noteId),
    syncStatus: 'PENDING_SYNC',
    updatedAt: Date.now(),
  })
}

export async function addArticleNote(
  articleId: string,
  note: { type: NoteType; content: string },
): Promise<OfflineArticle> {
  const article = await getArticleById(articleId)

  if (!article) {
    throw new Error('Article not found')
  }

  const nextNote: ArticleNote = {
    id: crypto.randomUUID(),
    type: note.type,
    content: note.content.trim(),
    createdAt: Date.now(),
  }

  return saveArticleOffline({
    ...article,
    notes: [nextNote, ...(article.notes ?? [])],
    syncStatus: 'PENDING_SYNC',
    updatedAt: Date.now(),
  })
}
