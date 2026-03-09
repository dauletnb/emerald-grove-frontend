import { openDB, IDBPDatabase } from 'idb';

export interface OfflineArticle {
  id: string;
  title: string;
  url: string;
  description: string;
  createdAt: number;
  syncStatus: 'PENDING_SYNC';
}

export const dbPromise = openDB('emarald-grove-db', 1, {
  upgrade(db: IDBPDatabase) {
    if (!db.objectStoreNames.contains('articles')) {
      db.createObjectStore('articles', { keyPath: 'id' });
    }
  },
});

export async function saveArticleOffline(article: OfflineArticle) {
  console.log('Saving article offline', article);
  const db = await dbPromise;
  await db.put('articles', article);
  console.log('Article saved to IndexedDB');
}

export async function getAllArticles(): Promise<OfflineArticle[]> {
  const db = await dbPromise;
  return db.getAll('articles');
}

export async function deleteArticle(id: string): Promise<void> {
  const db = await dbPromise;
  await db.delete('articles', id);
}