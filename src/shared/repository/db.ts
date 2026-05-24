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
  content?: string
  createdAt: number
  updatedAt?: number
  syncStatus: 'SYNCED' | 'PENDING_SYNC'
  serverPersisted: boolean
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

export type PendingCollectionLinkDeletionItem = {
  externalId: string
  articleExternalId: string
  collectionExternalId: string
}

type DeletedExternalIdItem = {
  externalId: string
}

/**
 * Preserve local note createdAt when the note already exists in IndexedDB.
 * Protects against backend timezone drift (+5h on each sync round-trip).
 */
function mergeNoteDates(incoming: ArticleNote[], existing?: ArticleNote[]): ArticleNote[] {
  if (!existing || existing.length === 0) return incoming
  const localDates = new Map(existing.map((n) => [n.id, n.createdAt]))
  return incoming.map((note) => {
    const localCreatedAt = localDates.get(note.id)
    return localCreatedAt != null ? { ...note, createdAt: localCreatedAt } : note
  })
}

function normalizeArticle(article: OfflineArticle): OfflineArticle {
  return {
    ...article,
    description: article.description ?? '',
    createdAt: article.createdAt ?? Date.now(),
    updatedAt: article.updatedAt ?? article.createdAt ?? Date.now(),
    syncStatus: article.syncStatus ?? 'SYNCED',
    serverPersisted: article.serverPersisted ?? article.syncStatus === 'SYNCED',
    notes: article.notes ?? [],
    isFavorite: article.isFavorite ?? false,
    isReadLater: article.isReadLater ?? false,
  }
}

export const dbPromise = openDB('emerald-grove-db', 3, {
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

    if (!db.objectStoreNames.contains('deletedArticles')) {
      db.createObjectStore('deletedArticles', { keyPath: 'externalId' })
    }

    if (!db.objectStoreNames.contains('deletedCollections')) {
      db.createObjectStore('deletedCollections', { keyPath: 'externalId' })
    }

    if (!db.objectStoreNames.contains('deletedArticleCollectionLinks')) {
      db.createObjectStore('deletedArticleCollectionLinks', { keyPath: 'externalId' })
    }
  },
})

async function findMatchingArticle(article: Pick<OfflineArticle, 'id' | 'url'>): Promise<OfflineArticle | undefined> {
  const db = await dbPromise
  const articles = await db.getAll('articles')

  return articles.find((storedArticle) => storedArticle.id === article.id || storedArticle.url === article.url)
}

async function queueDeletedExternalId(storeName: 'deletedArticles' | 'deletedCollections', externalId: string): Promise<void> {
  const db = await dbPromise
  await db.put(storeName, { externalId } satisfies DeletedExternalIdItem)
}

async function clearDeletedExternalIds(
  storeName: 'deletedArticles' | 'deletedCollections',
  externalIds: string[],
): Promise<void> {
  if (externalIds.length === 0) {
    return
  }

  const db = await dbPromise
  const tx = db.transaction(storeName, 'readwrite')

  for (const externalId of externalIds) {
    await tx.objectStore(storeName).delete(externalId)
  }

  await tx.done
}

async function clearMatchingCollectionLinkDeletions(
  articleExternalId: string,
  collectionExternalId: string,
): Promise<void> {
  const db = await dbPromise
  const tx = db.transaction('deletedArticleCollectionLinks', 'readwrite')
  const store = tx.objectStore('deletedArticleCollectionLinks')
  const items = (await store.getAll()) as PendingCollectionLinkDeletionItem[]

  for (const item of items) {
    if (item.articleExternalId === articleExternalId && item.collectionExternalId === collectionExternalId) {
      await store.delete(item.externalId)
    }
  }

  await tx.done
}

export async function saveArticleOffline(article: OfflineArticle): Promise<OfflineArticle> {
  const db = await dbPromise
  const existingArticle = await findMatchingArticle(article)
  const normalizedArticle = normalizeArticle({
    ...existingArticle,
    ...article,
    id: article.id,
    url: article.url,
    notes: mergeNoteDates(article.notes ?? [], existingArticle?.notes),
    isFavorite: article.isFavorite ?? existingArticle?.isFavorite ?? false,
    isReadLater: article.isReadLater ?? existingArticle?.isReadLater ?? false,
  })

  if (existingArticle && existingArticle.id !== normalizedArticle.id) {
    await db.delete('articles', existingArticle.id)
  }

  await db.put('articles', normalizedArticle)
  await db.delete('deletedArticles', normalizedArticle.id)
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
  const article = await getArticleById(id)
  await db.delete('articles', id)

  const linkStore = db.transaction('articleCollectionLinks', 'readwrite').objectStore('articleCollectionLinks')
  const links = await linkStore.index('by_articleId').getAll(id)

  for (const link of links) {
    await linkStore.delete(link.id)
  }

  if (article?.serverPersisted) {
    await queueDeletedExternalId('deletedArticles', id)
  }
}

export async function getPendingArticleDeletions(): Promise<string[]> {
  const db = await dbPromise
  const items = (await db.getAll('deletedArticles')) as DeletedExternalIdItem[]
  return items.map((item) => item.externalId)
}

export async function clearPendingArticleDeletions(externalIds: string[]): Promise<void> {
  await clearDeletedExternalIds('deletedArticles', externalIds)
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

export async function updateArticleNote(
  articleId: string,
  noteId: string,
  patch: { type: NoteType; content: string },
): Promise<OfflineArticle> {
  const article = await getArticleById(articleId)

  if (!article) {
    throw new Error('Article not found')
  }

  return saveArticleOffline({
    ...article,
    notes: article.notes.map((note) =>
      note.id === noteId ? { ...note, type: patch.type, content: patch.content.trim() } : note,
    ),
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
    syncStatus: 'PENDING_SYNC',
    updatedAt: Date.now(),
  }))
}

export async function setArticleReadLater(articleId: string, value: boolean): Promise<OfflineArticle> {
  return updateArticle(articleId, (article) => ({
    ...article,
    isReadLater: value,
    syncStatus: 'PENDING_SYNC',
    updatedAt: Date.now(),
  }))
}

function normalizeCollection(collection: ArticleCollection): ArticleCollection {
  return {
    ...collection,
    createdAt: collection.createdAt ?? Date.now(),
    updatedAt: collection.updatedAt ?? collection.createdAt ?? Date.now(),
    syncStatus: collection.syncStatus ?? 'SYNCED',
    serverPersisted: collection.serverPersisted ?? collection.syncStatus === 'SYNCED',
  }
}

function normalizeCollectionLink(link: ArticleCollectionLink): ArticleCollectionLink {
  return {
    ...link,
    createdAt: link.createdAt ?? Date.now(),
    syncStatus: link.syncStatus ?? 'SYNCED',
    serverPersisted: link.serverPersisted ?? link.syncStatus === 'SYNCED',
  }
}

export async function saveCollectionOffline(collection: ArticleCollection): Promise<ArticleCollection> {
  const normalizedCollection = normalizeCollection(collection)
  const db = await dbPromise
  await db.put('collections', normalizedCollection)
  await db.delete('deletedCollections', normalizedCollection.id)
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
    serverPersisted: options?.syncStatus === 'SYNCED',
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
  const collection = (await db.get('collections', collectionId)) as ArticleCollection | undefined
  await db.delete('collections', collectionId)

  const linkStore = db.transaction('articleCollectionLinks', 'readwrite').objectStore('articleCollectionLinks')
  const links = await linkStore.index('by_collectionId').getAll(collectionId)

  for (const link of links) {
    await linkStore.delete(link.id)
  }

  if (collection?.serverPersisted) {
    await queueDeletedExternalId('deletedCollections', collectionId)
  }
}

export async function getPendingCollectionDeletions(): Promise<string[]> {
  const db = await dbPromise
  const items = (await db.getAll('deletedCollections')) as DeletedExternalIdItem[]
  return items.map((item) => item.externalId)
}

export async function clearPendingCollectionDeletions(externalIds: string[]): Promise<void> {
  await clearDeletedExternalIds('deletedCollections', externalIds)
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
        serverPersisted: true,
      }),
    )
  }

  for (const link of links) {
    await linkStore.put(
      normalizeCollectionLink({
        ...link,
        syncStatus: 'SYNCED',
        serverPersisted: true,
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

export async function getPendingCollectionLinkDeletions(): Promise<PendingCollectionLinkDeletionItem[]> {
  const db = await dbPromise
  return (await db.getAll('deletedArticleCollectionLinks')) as PendingCollectionLinkDeletionItem[]
}

export async function clearPendingCollectionLinkDeletions(externalIds: string[]): Promise<void> {
  if (externalIds.length === 0) {
    return
  }

  const db = await dbPromise
  const tx = db.transaction('deletedArticleCollectionLinks', 'readwrite')

  for (const externalId of externalIds) {
    await tx.objectStore('deletedArticleCollectionLinks').delete(externalId)
  }

  await tx.done
}

async function queueCollectionLinkDeletion(link: PendingCollectionLinkDeletionItem): Promise<void> {
  const db = await dbPromise
  await db.put('deletedArticleCollectionLinks', link)
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
      serverPersisted: options?.syncStatus === 'SYNCED' || existingLink?.serverPersisted === true,
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
  await clearMatchingCollectionLinkDeletions(articleId, collectionId)
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

  if (existingLink?.serverPersisted && options?.syncStatus !== 'SYNCED') {
    await queueCollectionLinkDeletion({
      externalId: existingLink.id,
      articleExternalId: articleId,
      collectionExternalId: collectionId,
    })
  }
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
