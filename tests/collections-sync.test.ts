import { describe, test, expect } from 'vitest'
import {
  buildCollectionLinksSnapshot,
  toOfflineCollection,
  toPendingCollectionLinksSyncPayload,
  toPendingCollectionsSyncPayload,
  type RemoteCollectionDto,
  type RemoteCollectionSyncDto,
} from '../src/shared/collections/syncHelpers'
import type { ArticleCollection, ArticleCollectionLink } from '../src/shared/types'

describe('toOfflineCollection', () => {
  test('maps full backend dto to synced local collection', () => {
    const remoteCollection: RemoteCollectionDto = {
      id: 17,
      externalId: 'collection-17',
      name: 'Reading List',
      createdAt: 1712160000000,
      updatedAt: 1712260000000,
      articleCount: 2,
      articleIds: ['article-1', 'article-2'],
    }
    expect(toOfflineCollection(remoteCollection)).toEqual({
      id: 'collection-17',
      name: 'Reading List',
      createdAt: 1712160000000,
      updatedAt: 1712260000000,
      syncStatus: 'SYNCED',
      serverPersisted: true,
    })
  })

  test('falls back to provided timestamp for sync dto without dates', () => {
    const remoteCollection: RemoteCollectionSyncDto = {
      externalId: 'collection-sync',
      name: 'Offline Queue',
    }
    expect(toOfflineCollection(remoteCollection, 1234567890)).toEqual({
      id: 'collection-sync',
      name: 'Offline Queue',
      createdAt: 1234567890,
      updatedAt: 1234567890,
      syncStatus: 'SYNCED',
      serverPersisted: true,
    })
  })

  test('handles null createdAt and updatedAt in full dto', () => {
    const remoteCollection: RemoteCollectionDto = {
      id: 42,
      externalId: 'collection-null-dates',
      name: 'Null Dates Collection',
      createdAt: null,
      updatedAt: null,
      articleCount: 0,
      articleIds: [],
    }
    expect(toOfflineCollection(remoteCollection, 9876543210)).toEqual({
      id: 'collection-null-dates',
      name: 'Null Dates Collection',
      createdAt: 9876543210,
      updatedAt: 9876543210,
      syncStatus: 'SYNCED',
      serverPersisted: true,
    })
  })
})

describe('buildCollectionLinksSnapshot', () => {
  test('creates deterministic synced links for every collection/article pair', () => {
    const snapshot = buildCollectionLinksSnapshot(
      [
        { collectionId: 'collection-1', articleIds: ['article-1', 'article-2'] },
        { collectionId: 'collection-2', articleIds: ['article-3'] },
      ],
      777,
    )
    expect(snapshot).toEqual([
      {
        id: 'article-1:collection-1',
        articleId: 'article-1',
        collectionId: 'collection-1',
        createdAt: 777,
        syncStatus: 'SYNCED',
        serverPersisted: true,
      },
      {
        id: 'article-2:collection-1',
        articleId: 'article-2',
        collectionId: 'collection-1',
        createdAt: 777,
        syncStatus: 'SYNCED',
        serverPersisted: true,
      },
      {
        id: 'article-3:collection-2',
        articleId: 'article-3',
        collectionId: 'collection-2',
        createdAt: 777,
        syncStatus: 'SYNCED',
        serverPersisted: true,
      },
    ])
  })
})

describe('toPendingCollectionsSyncPayload', () => {
  test('includes only pending collections and maps id to externalId', () => {
    const collections: ArticleCollection[] = [
      {
        id: 'collection-pending',
        name: 'Pending',
        createdAt: 1,
        updatedAt: 2,
        syncStatus: 'PENDING_SYNC',
      },
      {
        id: 'collection-synced',
        name: 'Synced',
        createdAt: 3,
        updatedAt: 4,
        syncStatus: 'SYNCED',
      },
    ]
    expect(toPendingCollectionsSyncPayload(collections)).toEqual([
      {
        externalId: 'collection-pending',
        name: 'Pending',
      },
    ])
  })
})

describe('toPendingCollectionLinksSyncPayload', () => {
  test('includes only pending links and preserves clientCreatedAt', () => {
    const links: ArticleCollectionLink[] = [
      {
        id: 'link-pending',
        articleId: 'article-1',
        collectionId: 'collection-1',
        createdAt: 101,
        syncStatus: 'PENDING_SYNC',
      },
      {
        id: 'link-synced',
        articleId: 'article-2',
        collectionId: 'collection-2',
        createdAt: 202,
        syncStatus: 'SYNCED',
      },
    ]
    expect(toPendingCollectionLinksSyncPayload(links)).toEqual([
      {
        externalId: 'link-pending',
        articleExternalId: 'article-1',
        collectionExternalId: 'collection-1',
        clientCreatedAt: 101,
      },
    ])
  })
})
