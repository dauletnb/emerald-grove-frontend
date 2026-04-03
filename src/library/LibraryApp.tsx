import { useEffect, useState } from 'react'
import { fetchArticlesFromServer, syncArticleToServer } from '../shared/api/articles'
import {
  addArticleNote,
  deleteArticle,
  getAllArticles,
  saveArticleOffline,
  saveArticlesOffline,
  type OfflineArticle,
} from '../shared/repository/db'
import type { NoteType } from '../shared/types'

const noteTypeOptions: Array<{ value: NoteType; label: string; accent: string; background: string }> = [
  { value: 'IDEA', label: 'Idea', accent: '#0f766e', background: '#ccfbf1' },
  { value: 'TASK', label: 'Task', accent: '#9a3412', background: '#ffedd5' },
  { value: 'QUESTION', label: 'Question', accent: '#4338ca', background: '#e0e7ff' },
]

type DraftState = {
  type: NoteType
  content: string
  saving: boolean
  error: string
}

function createDraftState(): DraftState {
  return {
    type: 'IDEA',
    content: '',
    saving: false,
    error: '',
  }
}

function getNoteTypeMeta(type: NoteType) {
  return noteTypeOptions.find((option) => option.value === type) ?? noteTypeOptions[0]
}

export function LibraryApp() {
  const [articles, setArticles] = useState<OfflineArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({})

  useEffect(() => {
    void loadLibrary()
  }, [])

  async function refreshArticles() {
    const data = await getAllArticles()
    setArticles(data)
  }

  async function loadLibrary() {
    await refreshArticles()
    setLoading(false)
    await syncLibrary()
  }

  async function syncLibrary() {
    setSyncing(true)

    try {
      const localArticles = await getAllArticles()

      for (const article of localArticles.filter((item) => item.syncStatus === 'PENDING_SYNC')) {
        const synced = await syncArticleToServer(article)
        await saveArticleOffline(synced.article)
      }

      const remoteArticles = await fetchArticlesFromServer()
      await saveArticlesOffline(remoteArticles)
      await refreshArticles()
    } catch (error) {
      console.warn('Library sync failed', error)
    } finally {
      setSyncing(false)
    }
  }

  async function handleDelete(id: string) {
    await deleteArticle(id)
    setArticles((prev) => prev.filter((article) => article.id !== id))
  }

  function getDraft(articleId: string): DraftState {
    return drafts[articleId] ?? createDraftState()
  }

  function updateDraft(articleId: string, patch: Partial<DraftState>) {
    setDrafts((prev) => ({
      ...prev,
      [articleId]: {
        ...getDraft(articleId),
        ...patch,
      },
    }))
  }

  async function handleAddNote(articleId: string) {
    const draft = getDraft(articleId)
    const content = draft.content.trim()

    if (!content) {
      updateDraft(articleId, { error: 'Введите текст заметки.' })
      return
    }

    updateDraft(articleId, { saving: true, error: '' })

    try {
      const localArticle = await addArticleNote(articleId, {
        type: draft.type,
        content,
      })

      const syncedArticle = await syncArticleToServer(localArticle)
      await saveArticleOffline(syncedArticle.article)
      await refreshArticles()

      setDrafts((prev) => ({
        ...prev,
        [articleId]: createDraftState(),
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось сохранить заметку.'
      updateDraft(articleId, { saving: false, error: message })
      await refreshArticles()
    }
  }

  if (loading) {
    return <div style={{ padding: 16 }}>Loading...</div>
  }

  return (
    <div
      style={{
        padding: 24,
        fontFamily: 'Segoe UI, sans-serif',
        background: 'linear-gradient(180deg, #f7fee7 0%, #f8fafc 32%, #ffffff 100%)',
        minHeight: '100vh',
        color: '#1f2937',
      }}
    >
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div>
            <h1 style={{ marginBottom: 8 }}>Library</h1>
            <p style={{ marginTop: 0, marginBottom: 0, color: '#4b5563' }}>
              Превращайте сохранённые статьи в рабочие знания: фиксируйте идеи, задачи и вопросы прямо рядом с источником.
            </p>
          </div>

          <button
            onClick={() => void syncLibrary()}
            disabled={syncing}
            style={{
              borderRadius: 12,
              border: '1px solid #a7f3d0',
              background: syncing ? '#d1d5db' : '#ecfdf5',
              color: '#065f46',
              padding: '10px 14px',
              cursor: syncing ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {syncing ? 'Syncing...' : 'Sync now'}
          </button>
        </div>

        {articles.length === 0 ? (
          <p>No saved articles yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {articles.map((article) => (
              <li
                key={article.id}
                style={{
                  border: '1px solid #d1fae5',
                  borderRadius: 18,
                  padding: 20,
                  marginBottom: 16,
                  background: 'rgba(255, 255, 255, 0.92)',
                  boxShadow: '0 14px 40px rgba(15, 23, 42, 0.06)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                  <div>
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontWeight: 700, fontSize: 18, color: '#065f46', textDecoration: 'none' }}
                    >
                      {article.title}
                    </a>
                    {article.description && (
                      <p style={{ margin: '8px 0', color: '#4b5563', fontSize: 14, lineHeight: 1.5 }}>
                        {article.description}
                      </p>
                    )}
                    <small style={{ color: '#6b7280' }}>
                      {new Date(article.createdAt).toLocaleString()} &bull; {article.syncStatus}
                    </small>
                  </div>

                  <button
                    onClick={() => handleDelete(article.id)}
                    style={{
                      cursor: 'pointer',
                      color: '#dc2626',
                      background: 'none',
                      border: 'none',
                      fontSize: 18,
                    }}
                    title="Delete"
                  >
                    &times;
                  </button>
                </div>

                <div
                  style={{
                    marginTop: 18,
                    paddingTop: 18,
                    borderTop: '1px solid #e5e7eb',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <strong style={{ fontSize: 15 }}>Active Notes</strong>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{article.notes.length} notes</span>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '140px minmax(0, 1fr) auto',
                      gap: 12,
                      alignItems: 'start',
                    }}
                  >
                    <select
                      value={getDraft(article.id).type}
                      onChange={(event) =>
                        updateDraft(article.id, {
                          type: event.target.value as NoteType,
                          error: '',
                        })
                      }
                      style={{
                        borderRadius: 12,
                        border: '1px solid #cbd5e1',
                        padding: '10px 12px',
                        background: '#ffffff',
                      }}
                    >
                      {noteTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>

                    <textarea
                      value={getDraft(article.id).content}
                      onChange={(event) =>
                        updateDraft(article.id, {
                          content: event.target.value,
                          error: '',
                        })
                      }
                      placeholder="Добавьте мысль, следующий шаг или вопрос по статье..."
                      rows={3}
                      style={{
                        width: '100%',
                        resize: 'vertical',
                        borderRadius: 12,
                        border: '1px solid #cbd5e1',
                        padding: '10px 12px',
                        fontFamily: 'inherit',
                        lineHeight: 1.45,
                      }}
                    />

                    <button
                      onClick={() => void handleAddNote(article.id)}
                      disabled={getDraft(article.id).saving}
                      style={{
                        borderRadius: 12,
                        border: 'none',
                        background: '#047857',
                        color: '#ffffff',
                        padding: '10px 16px',
                        cursor: getDraft(article.id).saving ? 'wait' : 'pointer',
                        minWidth: 110,
                      }}
                    >
                      {getDraft(article.id).saving ? 'Saving...' : 'Add note'}
                    </button>
                  </div>

                  {getDraft(article.id).error && (
                    <p style={{ color: '#dc2626', fontSize: 13, marginTop: 10, marginBottom: 0 }}>
                      {getDraft(article.id).error}
                    </p>
                  )}

                  {article.notes.length === 0 ? (
                    <div
                      style={{
                        marginTop: 16,
                        padding: 14,
                        borderRadius: 14,
                        background: '#f8fafc',
                        color: '#64748b',
                        fontSize: 14,
                      }}
                    >
                      Пока нет заметок. Добавьте первую идею, задачу или вопрос, чтобы чтение стало активной работой.
                    </div>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0' }}>
                      {article.notes.map((note) => {
                        const meta = getNoteTypeMeta(note.type)

                        return (
                          <li
                            key={note.id}
                            style={{
                              padding: 14,
                              borderRadius: 14,
                              background: '#f8fafc',
                              border: '1px solid #e5e7eb',
                              marginBottom: 10,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  padding: '4px 10px',
                                  borderRadius: 999,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: meta.accent,
                                  background: meta.background,
                                }}
                              >
                                {meta.label}
                              </span>
                              <span style={{ fontSize: 12, color: '#6b7280' }}>
                                {new Date(note.createdAt).toLocaleString()}
                              </span>
                            </div>

                            <p style={{ margin: 0, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{note.content}</p>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
