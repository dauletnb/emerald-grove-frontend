import type { ArticleCollection, ArticleCollectionLink } from '../types'

export type RemoteCollectionSyncDto = {
  externalId: string
  name: string
}

export type RemoteCollectionDto = RemoteCollectionSyncDto & {
  id: number
  createdAt: number | null
  updatedAt: number | null
  articleCount: number
  articleIds: string[]
}

export function toOfflineCollection(
  remoteCollection: RemoteCollectionSyncDto | RemoteCollectionDto,
  now: number = Date.now(),
): ArticleCollection {
  return {
    id: remoteCollection.externalId,
    name: remoteCollection.name,
    createdAt: 'createdAt' in remoteCollection ? remoteCollection.createdAt ?? now : now,
    updatedAt: 'updatedAt' in remoteCollection ? remoteCollection.updatedAt ?? remoteCollection.createdAt ?? now : now,
    syncStatus: 'SYNCED',
    serverPersisted: true,
  }
}

export function buildCollectionLinksSnapshot(
  items: Array<{ collectionId: string; articleIds: string[] }>,
  now: number = Date.now(),
): ArticleCollectionLink[] {
  return items.flatMap(({ collectionId, articleIds }) =>
    articleIds.map((articleId) => ({
      id: `${articleId}:${collectionId}`,
      articleId,
      collectionId,
      createdAt: now,
      syncStatus: 'SYNCED' as const,
      serverPersisted: true,
    })),
  )
}

export function toPendingCollectionsSyncPayload(
  collections: ArticleCollection[],
): Array<{ externalId: string; name: string }> {
  return collections
    .filter((collection) => collection.syncStatus === 'PENDING_SYNC')
    .map((collection) => ({
      externalId: collection.id,
      name: collection.name,
    }))
}

export function toPendingCollectionLinksSyncPayload(
  links: ArticleCollectionLink[],
): Array<{
  externalId: string
  articleExternalId: string
  collectionExternalId: string
  clientCreatedAt: number
}> {
  return links
    .filter((link) => link.syncStatus === 'PENDING_SYNC')
    .map((link) => ({
      externalId: link.id,
      articleExternalId: link.articleId,
      collectionExternalId: link.collectionId,
      clientCreatedAt: link.createdAt,
    }))
}
