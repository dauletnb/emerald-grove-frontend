import { useEffect, useMemo, useState } from 'react'
import { SafeNoteRenderer } from '../components/SafeNoteRenderer'
import { fetchArticlesFromServer, syncArticleToServer } from '../shared/api/articles'
import {
  addArticleNote,
  deleteArticle,
  getAllArticles,
  saveArticleOffline,
  saveArticlesOffline,
  type OfflineArticle,
} from '../shared/repository/db'
import type { ArticleNote, NoteType } from '../shared/types'

const noteTypeOptions: Array<{ value: NoteType; label: string; badgeClass: string; dotClass: string }> = [
  { value: 'IDEA', label: 'Idea', badgeClass: 'bg-emerald-100 text-emerald-800', dotClass: 'bg-emerald-500' },
  { value: 'TASK', label: 'Task', badgeClass: 'bg-amber-100 text-amber-800', dotClass: 'bg-amber-500' },
  { value: 'QUESTION', label: 'Question', badgeClass: 'bg-indigo-100 text-indigo-800', dotClass: 'bg-indigo-500' },
]

const noteFilters = ['ALL', 'IDEA', 'TASK', 'QUESTION'] as const
const NOTE_CONTENT_MAX_LENGTH = 2000

type NoteFilter = (typeof noteFilters)[number]

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

function formatDate(value: number) {
  return new Date(value).toLocaleString()
}

function getNoteCounts(notes: ArticleNote[]) {
  return notes.reduce(
    (acc, note) => {
      acc.total += 1
      acc[note.type] += 1
      return acc
    },
    { total: 0, IDEA: 0, TASK: 0, QUESTION: 0 },
  )
}

function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
        active
          ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
      }`}
    >
      {children}
    </button>
  )
}

function NoteBadge({ type, count }: { type: NoteType; count?: number }) {
  const meta = getNoteTypeMeta(type)

  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${meta.badgeClass}`}>
      <span className={`h-2 w-2 rounded-full ${meta.dotClass}`} />
      {meta.label}
      {typeof count === 'number' ? <span className="text-[11px] opacity-75">{count}</span> : null}
    </span>
  )
}

function EmptyArticleState() {
  return (
    <div className="rounded-[28px] border border-dashed border-emerald-200 bg-white/85 p-10 text-center shadow-[0_24px_80px_rgba(15,23,42,0.06)]">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-2xl text-emerald-700">
        +
      </div>
      <h2 className="text-xl font-semibold text-slate-900">Library is still empty</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
        Save a few articles first, then we can turn them into working knowledge with questions, ideas, and next steps.
      </p>
    </div>
  )
}

function EmptyNotesState() {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm leading-6 text-slate-500">
      No notes yet. Start with a question, capture an implementation idea, or turn the article into a concrete task.
    </div>
  )
}

export function LibraryApp() {
  const [articles, setArticles] = useState<OfflineArticle[]>([])
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({})
  const [noteFilter, setNoteFilter] = useState<NoteFilter>('ALL')

  useEffect(() => {
    void loadLibrary()
  }, [])

  useEffect(() => {
    if (articles.length === 0) {
      setSelectedArticleId(null)
      return
    }

    setSelectedArticleId((current) => {
      if (current && articles.some((article) => article.id === current)) {
        return current
      }

      return articles[0].id
    })
  }, [articles])

  const selectedArticle = useMemo(
    () => articles.find((article) => article.id === selectedArticleId) ?? null,
    [articles, selectedArticleId],
  )

  const selectedNotes = useMemo(() => {
    if (!selectedArticle) {
      return []
    }

    return noteFilter === 'ALL'
      ? selectedArticle.notes
      : selectedArticle.notes.filter((note) => note.type === noteFilter)
  }, [noteFilter, selectedArticle])

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
      updateDraft(articleId, { error: 'Please add a short note before saving.' })
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
      const message = error instanceof Error ? error.message : 'Failed to save the note.'
      updateDraft(articleId, { saving: false, error: message })
      await refreshArticles()
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-950 px-6 py-10 text-sm text-white">Loading library...</div>
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.22),_transparent_28%),linear-gradient(180deg,#f7fee7_0%,#f8fafc_34%,#eef2ff_100%)] px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="overflow-hidden rounded-[32px] border border-white/70 bg-white/75 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur xl:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">Emerald Grove</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Library that leads to action</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                Articles stay scannable in the library, while questions, ideas, and tasks live in a dedicated reading
                workspace on the right.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <span className="font-semibold">{articles.length}</span> saved articles
              </div>
              <button
                onClick={() => void syncLibrary()}
                disabled={syncing}
                className={`rounded-2xl px-4 py-3 text-sm font-semibold text-white transition ${
                  syncing ? 'cursor-wait bg-slate-400' : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                {syncing ? 'Syncing...' : 'Sync now'}
              </button>
            </div>
          </div>
        </header>

        {articles.length === 0 ? (
          <EmptyArticleState />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
            <section className="rounded-[32px] border border-white/70 bg-white/80 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:p-5">
              <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 px-2 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">Saved articles</h2>
                  <p className="mt-1 text-sm text-slate-500">Quick scan first. Deep work happens in the article panel.</p>
                </div>
                <div className="text-sm text-slate-500">Sorted by recent activity</div>
              </div>

              <div className="space-y-3">
                {articles.map((article) => {
                  const counts = getNoteCounts(article.notes)
                  const isSelected = article.id === selectedArticleId

                  return (
                    <article
                      key={article.id}
                      className={`group rounded-[28px] border p-5 transition ${
                        isSelected
                          ? 'border-emerald-300 bg-emerald-50/80 shadow-[0_20px_45px_rgba(16,185,129,0.14)]'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80'
                      }`}
                    >
                      <div className="flex gap-4">
                        <button className="flex-1 text-left" onClick={() => setSelectedArticleId(article.id)}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white">
                              {counts.total} notes
                            </span>
                            {article.syncStatus === 'PENDING_SYNC' ? (
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">
                                Pending sync
                              </span>
                            ) : null}
                          </div>

                          <h3 className="mt-4 text-xl font-semibold leading-tight text-slate-950 transition group-hover:text-slate-700">
                            {article.title}
                          </h3>

                          {article.description ? (
                            <SafeNoteRenderer
                              as="p"
                              content={article.description}
                              maxLength={280}
                              className="mt-3 overflow-hidden text-sm leading-6 text-slate-600"
                            />
                          ) : null}

                          <div className="mt-4 flex flex-wrap gap-2">
                            {noteTypeOptions.map((option) =>
                              counts[option.value] > 0 ? (
                                <NoteBadge key={option.value} type={option.value} count={counts[option.value]} />
                              ) : null,
                            )}
                            {counts.total === 0 ? (
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                                No notes yet
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                            <span>{formatDate(article.createdAt)}</span>
                            <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:block" />
                            <span>{new URL(article.url).hostname}</span>
                          </div>
                        </button>

                        <div className="flex flex-col items-end justify-between gap-3">
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                          >
                            Open source
                          </a>

                          <button
                            onClick={() => void handleDelete(article.id)}
                            className="rounded-full px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                            title="Delete article"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>

            <aside className="rounded-[32px] border border-slate-200/80 bg-slate-950 text-white shadow-[0_24px_80px_rgba(15,23,42,0.24)]">
              {selectedArticle ? (
                <div className="flex h-full flex-col">
                  <div className="border-b border-white/10 p-6">
                    <div className="flex flex-wrap gap-2">
                      {noteTypeOptions.map((option) => {
                        const count = getNoteCounts(selectedArticle.notes)[option.value]
                        return count > 0 ? <NoteBadge key={option.value} type={option.value} count={count} /> : null
                      })}
                    </div>

                    <h2 className="mt-4 text-2xl font-semibold leading-tight">{selectedArticle.title}</h2>

                    {selectedArticle.description ? (
                      <SafeNoteRenderer
                        as="p"
                        content={selectedArticle.description}
                        className="mt-3 text-sm leading-6 text-slate-300"
                      />
                    ) : null}

                    <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-slate-400">
                      <span>{formatDate(selectedArticle.createdAt)}</span>
                      <span className="h-1 w-1 rounded-full bg-slate-600" />
                      <span>{selectedArticle.notes.length} total notes</span>
                    </div>
                  </div>

                  <div className="border-b border-white/10 p-6">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">Notes workspace</p>
                        <p className="mt-1 text-sm text-slate-400">Questions stay visible, ideas stay reusable, tasks stay actionable.</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {noteFilters.map((filter) => (
                        <FilterChip
                          key={filter}
                          active={noteFilter === filter}
                          onClick={() => setNoteFilter(filter)}
                        >
                          {filter === 'ALL' ? 'All notes' : getNoteTypeMeta(filter).label}
                        </FilterChip>
                      ))}
                    </div>
                  </div>

                  <div className="border-b border-white/10 p-6">
                    <div className="grid gap-3 sm:grid-cols-[144px_minmax(0,1fr)]">
                      <select
                        value={getDraft(selectedArticle.id).type}
                        onChange={(event) =>
                          updateDraft(selectedArticle.id, {
                            type: event.target.value as NoteType,
                            error: '',
                          })
                        }
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
                      >
                        {noteTypeOptions.map((option) => (
                          <option key={option.value} value={option.value} className="text-slate-900">
                            {option.label}
                          </option>
                        ))}
                      </select>

                      <textarea
                        value={getDraft(selectedArticle.id).content}
                        onChange={(event) =>
                          updateDraft(selectedArticle.id, {
                            content: event.target.value,
                            error: '',
                          })
                        }
                        placeholder="Capture the question, implementation idea, or next task while the article is still fresh."
                        rows={4}
                        maxLength={NOTE_CONTENT_MAX_LENGTH}
                        className="min-h-28 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400"
                      />
                    </div>

                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-rose-300">
                        {getDraft(selectedArticle.id).error || `${getDraft(selectedArticle.id).content.length}/${NOTE_CONTENT_MAX_LENGTH}`}
                      </p>
                      <button
                        onClick={() => void handleAddNote(selectedArticle.id)}
                        disabled={getDraft(selectedArticle.id).saving}
                        className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                          getDraft(selectedArticle.id).saving
                            ? 'cursor-wait bg-slate-600 text-slate-200'
                            : 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
                        }`}
                      >
                        {getDraft(selectedArticle.id).saving ? 'Saving...' : 'Add note'}
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-white">
                        {noteFilter === 'ALL' ? 'All notes' : `${getNoteTypeMeta(noteFilter).label} notes`}
                      </h3>
                      <span className="text-sm text-slate-400">{selectedNotes.length} shown</span>
                    </div>

                    {selectedNotes.length === 0 ? (
                      <EmptyNotesState />
                    ) : (
                      <div className="space-y-3">
                        {selectedNotes.map((note) => (
                          <article key={note.id} className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                            <div className="flex flex-wrap items-center gap-3">
                              <NoteBadge type={note.type} />
                              <span className="text-xs text-slate-400">{formatDate(note.createdAt)}</span>
                            </div>

                            <SafeNoteRenderer
                              as="p"
                              content={note.content}
                              className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-100"
                            />
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[420px] items-center justify-center p-8 text-center text-sm text-slate-400">
                  Select an article to review its notes.
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}
