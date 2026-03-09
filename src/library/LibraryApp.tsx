import { useEffect, useState } from 'react';
import { getAllArticles, deleteArticle, OfflineArticle } from '../background/db';

export function LibraryApp() {
  const [articles, setArticles] = useState<OfflineArticle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllArticles().then((data) => {
      setArticles(data);
      setLoading(false);
    });
  }, []);

  async function handleDelete(id: string) {
    await deleteArticle(id);
    setArticles((prev) => prev.filter((a) => a.id !== id));
  }

  if (loading) return <div style={{ padding: 16 }}>Loading...</div>;

  return (
    <div style={{ padding: 16, fontFamily: 'sans-serif' }}>
      <h1>Library</h1>
      {articles.length === 0 ? (
        <p>No saved articles yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {articles.map((article) => (
            <li
              key={article.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: 8,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <a href={article.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 'bold', fontSize: 16 }}>
                    {article.title}
                  </a>
                  {article.description && (
                    <p style={{ margin: '4px 0', color: '#555', fontSize: 14 }}>{article.description}</p>
                  )}
                  <small style={{ color: '#999' }}>
                    {new Date(article.createdAt).toLocaleString()} &bull; {article.syncStatus}
                  </small>
                </div>
                <button
                  onClick={() => handleDelete(article.id)}
                  style={{ marginLeft: 12, cursor: 'pointer', color: 'red', background: 'none', border: 'none', fontSize: 18 }}
                  title="Delete"
                >
                  &times;
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
