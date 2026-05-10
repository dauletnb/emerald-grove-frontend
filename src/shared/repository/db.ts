import { openDB, IDBPDatabase } from 'idb'
import {
  toPendingCollectionLinksSyncPayload,
  toPendingCollectionsSyncPayload,
} from '../collections/syncHelpers'
import type { ArticleCollection, ArticleCollectionLink, ArticleNote, NoteType } from '../types'

export interface OfflineArticle {
  id: string
  title: string
  url: string
  description: string
  createdAt: number
  updatedAt?: number
  syncStatus: 'SYNCED' | 'PENDING_SYNC'
  notes: ArticleNote[]
  isFavorite: boolean
  isReadLater: boolean
}

export type CollectionSyncStatus = 'SYNCED' | 'PENDING_SYNC'

export type PendingCollectionSyncItem = {
  externalId: string
  name: string
}

export type PendingCollectionLinkSyncItem = {
  externalId: string
  articleExternalId: string
  collectionExternalId: string
  clientCreatedAt: number
}

function normalizeArticle(article: OfflineArticle): OfflineArticle {
  return {
    ...article,
    description: article.description ?? '',
    createdAt: article.createdAt ?? Date.now(),
    updatedAt: article.updatedAt ?? article.createdAt ?? Date.now(),
    notes: article.notes ?? [],
    isFavorite: article.isFavorite ?? false,
    isReadLater: article.isReadLater ?? false,
  }
}

export const dbPromise = openDB('emerald-grove-db', 2, {
  upgrade(db: IDBPDatabase) {
    if (!db.objectStoreNames.contains('articles')) {
      db.createObjectStore('articles', { keyPath: 'id' })
    }

    if (!db.objectStoreNames.contains('collections')) {
      db.createObjectStore('collections', { keyPath: 'id' })
    }

    if (!db.objectStoreNames.contains('articleCollectionLinks')) {
      const linkStore = db.createObjectStore('articleCollectionLinks', { keyPath: 'id' })
      linkStore.createIndex('by_articleId', 'articleId', { unique: false })
      linkStore.createIndex('by_collectionId', 'collectionId', { unique: false })
      linkStore.createIndex('by_article_collection', ['articleId', 'collectionId'], { unique: true })
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
    isFavorite: article.isFavorite ?? existingArticle?.isFavorite ?? false,
    isReadLater: article.isReadLater ?? existingArticle?.isReadLater ?? false,
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

  const linkStore = db.transaction('articleCollectionLinks', 'readwrite').objectStore('articleCollectionLinks')
  const links = await linkStore.index('by_articleId').getAll(id)

  for (const link of links) {
    await linkStore.delete(link.id)
  }
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

async function updateArticle(
  articleId: string,
  updater: (article: OfflineArticle) => OfflineArticle,
): Promise<OfflineArticle> {
  const article = await getArticleById(articleId)

  if (!article) {
    throw new Error('Article not found')
  }

  return saveArticleOffline(updater(article))
}

export async function setArticleFavorite(articleId: string, value: boolean): Promise<OfflineArticle> {
  return updateArticle(articleId, (article) => ({
    ...article,
    isFavorite: value,
    updatedAt: Date.now(),
  }))
}

export async function setArticleReadLater(articleId: string, value: boolean): Promise<OfflineArticle> {
  return updateArticle(articleId, (article) => ({
    ...article,
    isReadLater: value,
    updatedAt: Date.now(),
  }))
}

function normalizeCollection(collection: ArticleCollection): ArticleCollection {
  return {
    ...collection,
    createdAt: collection.createdAt ?? Date.now(),
    updatedAt: collection.updatedAt ?? collection.createdAt ?? Date.now(),
    syncStatus: collection.syncStatus ?? 'SYNCED',
  }
}

function normalizeCollectionLink(link: ArticleCollectionLink): ArticleCollectionLink {
  return {
    ...link,
    createdAt: link.createdAt ?? Date.now(),
    syncStatus: link.syncStatus ?? 'SYNCED',
  }
}

export async function saveCollectionOffline(collection: ArticleCollection): Promise<ArticleCollection> {
  const normalizedCollection = normalizeCollection(collection)
  const db = await dbPromise
  await db.put('collections', normalizedCollection)
  return normalizedCollection
}

export async function createCollection(
  name: string,
  options?: { id?: string; syncStatus?: CollectionSyncStatus },
): Promise<ArticleCollection> {
  const trimmedName = name.trim()

  if (!trimmedName) {
    throw new Error('Collection name is required')
  }

  const now = Date.now()
  const collection: ArticleCollection = {
    id: options?.id ?? crypto.randomUUID(),
    name: trimmedName,
    createdAt: now,
    updatedAt: now,
    syncStatus: options?.syncStatus ?? 'PENDING_SYNC',
  }

  return saveCollectionOffline(collection)
}

export async function renameCollection(collectionId: string, name: string): Promise<ArticleCollection> {
  const db = await dbPromise
  const existing = (await db.get('collections', collectionId)) as ArticleCollection | undefined

  if (!existing) {
    throw new Error('Collection not found')
  }

  const trimmedName = name.trim()

  if (!trimmedName) {
    throw new Error('Collection name is required')
  }

  const nextCollection = normalizeCollection({
    ...existing,
    name: trimmedName,
    updatedAt: Date.now(),
    syncStatus: 'PENDING_SYNC',
  })

  await db.put('collections', nextCollection)
  return nextCollection
}

export async function deleteCollection(collectionId: string): Promise<void> {
  const db = await dbPromise
  await db.delete('collections', collectionId)

  const linkStore = db.transaction('articleCollectionLinks', 'readwrite').objectStore('articleCollectionLinks')
  const links = await linkStore.index('by_collectionId').getAll(collectionId)

  for (const link of links) {
    await linkStore.delete(link.id)
  }
}

export async function getAllCollections(): Promise<ArticleCollection[]> {
  const db = await dbPromise
  const collections = ((await db.getAll('collections')) as ArticleCollection[]).map(normalizeCollection)

  return collections.sort((left, right) => left.name.localeCompare(right.name))
}

export async function replaceCollectionsState(
  collections: ArticleCollection[],
  links: ArticleCollectionLink[],
): Promise<void> {
  const db = await dbPromise
  const tx = db.transaction(['articleCollectionLinks', 'collections'], 'readwrite')
  const collectionStore = tx.objectStore('collections')
  const linkStore = tx.objectStore('articleCollectionLinks')

  await collectionStore.clear()
  await linkStore.clear()

  for (const collection of collections) {
    await collectionStore.put(
      normalizeCollection({
        ...collection,
        syncStatus: 'SYNCED',
      }),
    )
  }

  for (const link of links) {
    await linkStore.put(
      normalizeCollectionLink({
        ...link,
        syncStatus: 'SYNCED',
      }),
    )
  }

  await tx.done
}

export async function getPendingCollectionsForSync(): Promise<PendingCollectionSyncItem[]> {
  const collections = await getAllCollections()
  return toPendingCollectionsSyncPayload(collections)
}

export async function getPendingCollectionLinksForSync(): Promise<PendingCollectionLinkSyncItem[]> {
  const db = await dbPromise
  const links = ((await db.getAll('articleCollectionLinks')) as ArticleCollectionLink[])
    .map(normalizeCollectionLink)

  return toPendingCollectionLinksSyncPayload(links)
}

export async function addArticleToCollection(
  articleId: string,
  collectionId: string,
  options?: { syncStatus?: CollectionSyncStatus; linkId?: string },
): Promise<void> {
  const db = await dbPromise
  const tx = db.transaction(['articleCollectionLinks', 'collections'], 'readwrite')
  const linkStore = tx.objectStore('articleCollectionLinks')
  const existingLink = (await linkStore.index('by_article_collection').get([articleId, collectionId])) as
    | ArticleCollectionLink
    | undefined

  await linkStore.put(
    normalizeCollectionLink({
      ...(existingLink ?? {}),
      id: existingLink?.id ?? options?.linkId ?? crypto.randomUUID(),
      articleId,
      collectionId,
      createdAt: existingLink?.createdAt ?? Date.now(),
      syncStatus: options?.syncStatus ?? existingLink?.syncStatus ?? 'PENDING_SYNC',
    }),
  )

  const collectionStore = tx.objectStore('collections')
  const collection = (await collectionStore.get(collectionId)) as ArticleCollection | undefined

  if (collection) {
    await collectionStore.put({
      ...normalizeCollection(collection),
      updatedAt: Date.now(),
      syncStatus: options?.syncStatus === 'SYNCED' ? collection.syncStatus : 'PENDING_SYNC',
    })
  }

  await tx.done
}

export async function removeArticleFromCollection(
  articleId: string,
  collectionId: string,
  options?: { syncStatus?: CollectionSyncStatus },
): Promise<void> {
  const db = await dbPromise
  const tx = db.transaction(['articleCollectionLinks', 'collections'], 'readwrite')
  const linkStore = tx.objectStore('articleCollectionLinks')
  const existingLink = (await linkStore.index('by_article_collection').get([articleId, collectionId])) as
    | ArticleCollectionLink
    | undefined

  if (existingLink) {
    await linkStore.delete(existingLink.id)
  }

  const collectionStore = tx.objectStore('collections')
  const collection = (await collectionStore.get(collectionId)) as ArticleCollection | undefined

  if (collection) {
    await collectionStore.put({
      ...normalizeCollection(collection),
      updatedAt: Date.now(),
      syncStatus: options?.syncStatus ?? 'PENDING_SYNC',
    })
  }

  await tx.done
}

export async function getCollectionArticleIds(collectionId: string): Promise<string[]> {
  const db = await dbPromise
  const links = (await db.getAllFromIndex(
    'articleCollectionLinks',
    'by_collectionId',
    IDBKeyRange.only(collectionId),
  )) as ArticleCollectionLink[]

  return links.map((link) => link.articleId)
}

export async function getArticleCollectionIds(articleId: string): Promise<string[]> {
  const db = await dbPromise
  const links = (await db.getAllFromIndex(
    'articleCollectionLinks',
    'by_articleId',
    IDBKeyRange.only(articleId),
  )) as ArticleCollectionLink[]

  return links.map((link) => link.collectionId)
}
