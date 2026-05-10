import { API_BASE_URL } from '@/config'
import { ApiAuthError } from './auth'
import { authFetch } from './articles'
import type { ArticleCollection, ArticleCollectionLink } from '../types'
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
): Promise<void> {
  const response = await authFetch(`${API_BASE_URL}/api/collections/sync`, {
    method: 'POST',
    body: JSON.stringify(collections),
  })

  assertOk(response, 'Sync collections')
}

export async function syncCollectionLinksToServer(
  links: Array<{
    externalId: string
    articleExternalId: string
    collectionExternalId: string
    clientCreatedAt: number
  }>,
): Promise<void> {
  const response = await authFetch(`${API_BASE_URL}/api/collections/links/sync`, {
    method: 'POST',
    body: JSON.stringify(links),
  })

  assertOk(response, 'Sync collection links')
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
