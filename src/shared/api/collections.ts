import { API_BASE_URL } from '@/config'
import { ApiAuthError } from './auth'
import { authFetch } from './articles'
import type { ArticleCollection, ArticleCollectionLink } from '../types'
import type { BatchSyncResponse } from './articles'
import {
  buildCollectionLinksSnapshot,
  toOfflineCollection,
  type RemoteCollectionDto,
  type RemoteCollectionSyncDto,
} from '../collections/syncHelpers'

function assertOk(response: Response, action: string): void {
  if (response.ok) {
    return
  }

  if (response.status === 401 || response.status === 403) {
    throw new ApiAuthError('Сервер отклонил запрос к коллекциям. Войдите снова.', response.status)
  }

  throw new Error(`${action} failed with status ${response.status}`)
}

export type CollectionLinkSyncResult = {
  externalId: string
  articleExternalId: string
  collectionExternalId: string
  status: 'APPLIED' | 'SKIPPED'
  reason?: string | null
}

export type CollectionLinkBatchSyncResponse = {
  appliedCount: number
  skippedCount: number
  applied: CollectionLinkSyncResult[]
  skipped: CollectionLinkSyncResult[]
}

export async function createCollectionOnServer(name: string): Promise<ArticleCollection> {
  const response = await authFetch(`${API_BASE_URL}/api/collections`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })

  assertOk(response, 'Create collection')

  const data = (await response.json()) as RemoteCollectionDto
  return toOfflineCollection(data)
}

export async function renameCollectionOnServer(externalId: string, name: string): Promise<ArticleCollection> {
  const response = await authFetch(`${API_BASE_URL}/api/collections/${encodeURIComponent(externalId)}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  })

  assertOk(response, 'Rename collection')

  const data = (await response.json()) as RemoteCollectionDto
  return toOfflineCollection(data)
}

export async function deleteCollectionOnServer(externalId: string): Promise<void> {
  const response = await authFetch(`${API_BASE_URL}/api/collections/${encodeURIComponent(externalId)}`, {
    method: 'DELETE',
  })

  assertOk(response, 'Delete collection')
}

export async function fetchCollectionsFromServer(): Promise<ArticleCollection[]> {
  const response = await authFetch(`${API_BASE_URL}/api/collections`, { method: 'GET' })
  assertOk(response, 'Fetch collections')

  const data = (await response.json()) as RemoteCollectionSyncDto[]
  return data.map(toOfflineCollection)
}

export async function fetchCollectionArticleIdsFromServer(collectionExternalId: string): Promise<string[]> {
  const response = await authFetch(
    `${API_BASE_URL}/api/collections/${encodeURIComponent(collectionExternalId)}/articles`,
    { method: 'GET' },
  )

  assertOk(response, 'Fetch collection articles')

  return (await response.json()) as string[]
}

export async function addArticleToCollectionOnServer(
  collectionExternalId: string,
  articleExternalId: string,
): Promise<void> {
  const response = await authFetch(
    `${API_BASE_URL}/api/collections/${encodeURIComponent(collectionExternalId)}/articles/${encodeURIComponent(articleExternalId)}`,
    { method: 'POST' },
  )

  assertOk(response, 'Add article to collection')
}

export async function removeArticleFromCollectionOnServer(
  collectionExternalId: string,
  articleExternalId: string,
): Promise<void> {
  const response = await authFetch(
    `${API_BASE_URL}/api/collections/${encodeURIComponent(collectionExternalId)}/articles/${encodeURIComponent(articleExternalId)}`,
    { method: 'DELETE' },
  )

  assertOk(response, 'Remove article from collection')
}

export async function syncCollectionsToServer(
  collections: Array<{ externalId: string; name: string }>,
): Promise<BatchSyncResponse> {
  const response = await authFetch(`${API_BASE_URL}/api/collections/sync`, {
    method: 'POST',
    body: JSON.stringify(collections),
  })

  assertOk(response, 'Sync collections')
  return (await response.json()) as BatchSyncResponse
}

export async function syncCollectionLinksToServer(
  links: Array<{
    externalId: string
    articleExternalId: string
    collectionExternalId: string
    clientCreatedAt: number
  }>,
): Promise<CollectionLinkBatchSyncResponse> {
  const response = await authFetch(`${API_BASE_URL}/api/collections/sync/links`, {
    method: 'POST',
    body: JSON.stringify(links),
  })

  assertOk(response, 'Sync collection links')
  return (await response.json()) as CollectionLinkBatchSyncResponse
}

export async function syncDeletedCollectionsToServer(
  collectionExternalIds: string[],
): Promise<BatchSyncResponse> {
  const response = await authFetch(`${API_BASE_URL}/api/collections/sync/deletions`, {
    method: 'POST',
    body: JSON.stringify({ externalIds: collectionExternalIds }),
  })

  assertOk(response, 'Sync deleted collections')
  return (await response.json()) as BatchSyncResponse
}

export async function syncDeletedCollectionLinksToServer(
  links: Array<{
    externalId: string
    articleExternalId: string
    collectionExternalId: string
  }>,
): Promise<CollectionLinkBatchSyncResponse> {
  const response = await authFetch(`${API_BASE_URL}/api/collections/sync/links/deletions`, {
    method: 'POST',
    body: JSON.stringify(links),
  })

  assertOk(response, 'Sync deleted collection links')
  return (await response.json()) as CollectionLinkBatchSyncResponse
}

export async function fetchCollectionsSnapshotFromServer(): Promise<{
  collections: ArticleCollection[]
  links: ArticleCollectionLink[]
}> {
  const collections = await fetchCollectionsFromServer()
  const articleIdsByCollection = await Promise.all(
    collections.map(async (collection) => ({
      collectionId: collection.id,
      articleIds: await fetchCollectionArticleIdsFromServer(collection.id),
    })),
  )

  const links: ArticleCollectionLink[] = buildCollectionLinksSnapshot(articleIdsByCollection)

  return { collections, links }
}
