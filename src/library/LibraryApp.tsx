import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AiPanel } from '../components/AiPanel'
import { SafeNoteRenderer } from '../components/SafeNoteRenderer'
import { deleteArticleFromServer, deleteNoteFromServer, fetchArticleAI, fetchArticlesFromServer, syncArticleToServer } from '../shared/api/articles'
import type { AIResult, AIStatus } from '../shared/types'
import {
  addArticleNote,
  addArticleToCollection,
  createCollection,
  deleteArticle,
  deleteArticleNote,
  getAllCollections,
  getArticleCollectionIds,
  getAllArticles,
  getCollectionArticleIds,
  removeArticleFromCollection,
  saveArticleOffline,
  saveArticlesOffline,
  setArticleFavorite,
  setArticleReadLater,
  type OfflineArticle,
} from '../shared/repository/db'
import type { ArticleCollection, ArticleNote, LibrarySection, NoteType, SystemSection } from '../shared/types'

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

const systemSections: Array<{ id: SystemSection; label: string; description: string }> = [
  { id: 'ALL', label: 'All', description: 'Everything in the library' },
  { id: 'RECENT', label: 'Recent', description: 'Sorted by latest activity' },
  { id: 'FAVORITES', label: 'Favorites', description: 'Pinned for quick access' },
  { id: 'READ_LATER', label: 'Read later', description: 'Queued for review' },
]

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

function SoftActionButton({
  active,
  icon,
  activeLabel,
  inactiveLabel,
  activeClassName,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  activeLabel: string
  inactiveLabel: string
  activeClassName: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? activeClassName
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
      }`}
    >
      {icon}
      {active ? activeLabel : inactiveLabel}
    </button>
  )
}

function SectionButton({
  active,
  title,
  subtitle,
  count,
  onClick,
}: {
  active: boolean
  title: string
  subtitle: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-[20px] border px-4 py-3 text-left transition ${
        active
          ? 'border-emerald-200 bg-emerald-50/90 text-slate-950'
          : 'border-slate-200 bg-white/90 text-slate-700 hover:border-slate-300 hover:bg-white'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{title}</span>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
          active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
        }`}>
          {count}
        </span>
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>
    </button>
  )
}

function NoteBadge({ type, count }: { type: NoteType; count?: number }) {
  const meta = getNoteTypeMeta(type)

  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${meta.badgeClass}`}>
      <span className={`h-2 w-2 rounded-full ${meta.dotClass}`} />
      {meta.label}
      {count != null ? <span className="text-[11px] opacity-75">{count}</span> : null}
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

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M9 3.75A2.25 2.25 0 0 0 6.75 6v.75H4.5a.75.75 0 0 0 0 1.5h.568l.773 10.07A2.25 2.25 0 0 0 8.084 20.5h7.832a2.25 2.25 0 0 0 2.243-2.18l.773-10.07h.568a.75.75 0 0 0 0-1.5h-2.25V6A2.25 2.25 0 0 0 15 3.75H9ZM8.25 6A.75.75 0 0 1 9 5.25h6a.75.75 0 0 1 .75.75v.75h-7.5V6Zm1.47 4.22a.75.75 0 0 1 .75.72v5.25a.75.75 0 0 1-1.5 0v-5.25a.75.75 0 0 1 .75-.72Zm4.56 0a.75.75 0 0 1 .75.72v5.25a.75.75 0 0 1-1.5 0v-5.25a.75.75 0 0 1 .75-.72Z" />
    </svg>
  )
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M11.48 3.5a.75.75 0 0 1 1.04 0l2.57 2.6 3.6.52a.75.75 0 0 1 .41 1.28l-2.6 2.54.61 3.58a.75.75 0 0 1-1.09.79L12 13.57l-3.22 1.69a.75.75 0 0 1-1.09-.79l.61-3.58-2.6-2.54a.75.75 0 0 1 .41-1.28l3.6-.52 2.57-2.6Z" />
    </svg>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 3.75a8.25 8.25 0 1 0 0 16.5 8.25 8.25 0 0 0 0-16.5Zm.75 3a.75.75 0 0 0-1.5 0v5.1c0 .2.08.39.22.53l2.85 2.85a.75.75 0 1 0 1.06-1.06l-2.63-2.63V6.75Z" />
    </svg>
  )
}

export function LibraryApp() {
  const [articles, setArticles] = useState<OfflineArticle[] | null>(null)
  const [collections, setCollections] = useState<ArticleCollection[]>([])
  const [collectionArticleIds, setCollectionArticleIds] = useState<Record<string, string[]>>({})
  const [articleCollectionIds, setArticleCollectionIds] = useState<Record<string, string[]>>({})
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null)
  const [selectedSection, setSelectedSection] = useState<LibrarySection>({ type: 'system', id: 'ALL' })
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({})
  const [noteFilter, setNoteFilter] = useState<NoteFilter>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [newCollectionName, setNewCollectionName] = useState('')
  const [collectionError, setCollectionError] = useState('')
  const [isManageSectionsOpen, setIsManageSectionsOpen] = useState(false)
  const [sidebarSectionSearchQuery, setSidebarSectionSearchQuery] = useState('')
  const [manageSectionSearchQuery, setManageSectionSearchQuery] = useState('')
  const [aiCache, setAiCache] = useState<Record<string, { status: AIStatus; result?: AIResult }>>({})
  const aiInitiated = useRef<Set<string>>(new Set())

  async function refreshArticles() {
    const data = await getAllArticles()
    setArticles(data)
  }

  async function refreshCollections() {
    const nextCollections = await getAllCollections()
    setCollections(nextCollections)

    const nextCollectionArticleIds: Record<string, string[]> = {}

    for (const collection of nextCollections) {
      nextCollectionArticleIds[collection.id] = await getCollectionArticleIds(collection.id)
    }

    setCollectionArticleIds(nextCollectionArticleIds)

    const nextArticleCollectionIds: Record<string, string[]> = {}
    const articleList = await getAllArticles()

    for (const article of articleList) {
      nextArticleCollectionIds[article.id] = await getArticleCollectionIds(article.id)
    }

    setArticleCollectionIds(nextArticleCollectionIds)
  }

  async function refreshLibraryState() {
    await Promise.all([refreshArticles(), refreshCollections()])
  }

  useEffect(() => {
    let cancelled = false

    const startLoadingLibrary = async () => {
      const data = await getAllArticles()
      const savedCollections = await getAllCollections()
      const nextCollectionArticleIds: Record<string, string[]> = {}

      for (const collection of savedCollections) {
        nextCollectionArticleIds[collection.id] = await getCollectionArticleIds(collection.id)
      }

      const nextArticleCollectionIds: Record<string, string[]> = {}

      for (const article of data) {
        nextArticleCollectionIds[article.id] = await getArticleCollectionIds(article.id)
      }

      if (!cancelled) {
        setArticles(data)
        setCollections(savedCollections)
        setCollectionArticleIds(nextCollectionArticleIds)
        setArticleCollectionIds(nextArticleCollectionIds)
      }

      try {
        const localArticles = await getAllArticles()

        for (const article of localArticles.filter((item) => item.syncStatus === 'PENDING_SYNC')) {
          const synced = await syncArticleToServer(article)
          await saveArticleOffline(synced.article)
        }

        const remoteArticles = await fetchArticlesFromServer()
        await saveArticlesOffline(remoteArticles)

        if (!cancelled) {
          const refreshedArticles = await getAllArticles()
          setArticles(refreshedArticles)
        }
      } catch (error) {
        console.warn('Library sync failed', error)
      }

      if (!cancelled) {
        await refreshCollections()
      }
    }

    const timeoutId = window.setTimeout(() => {
      void startLoadingLibrary()
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [])

  const sectionArticles = useMemo(() => {
    const loadedArticles = articles ?? []

    if (selectedSection.type === 'collection') {
      const articleIds = new Set(collectionArticleIds[selectedSection.id] ?? [])
      return loadedArticles.filter((article) => articleIds.has(article.id))
    }

    switch (selectedSection.id) {
      case 'ALL':
        return loadedArticles
      case 'RECENT':
        return [...loadedArticles].sort((left, right) => (right.updatedAt ?? right.createdAt) - (left.updatedAt ?? left.createdAt))
      case 'FAVORITES':
        return loadedArticles.filter((article) => article.isFavorite)
      case 'READ_LATER':
        return loadedArticles.filter((article) => article.isReadLater)
    }
  }, [articles, collectionArticleIds, selectedSection])

  const filteredArticles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    if (!query) {
      return sectionArticles
    }

    return sectionArticles.filter(
      (article) =>
        article.title.toLowerCase().includes(query) ||
        article.description.toLowerCase().includes(query) ||
        article.url.toLowerCase().includes(query),
    )
  }, [searchQuery, sectionArticles])

  const resolvedSelectedArticleId = useMemo(() => {
    if (filteredArticles.length === 0) {
      return null
    }

    if (selectedArticleId && filteredArticles.some((article) => article.id === selectedArticleId)) {
      return selectedArticleId
    }

    return filteredArticles[0].id
  }, [filteredArticles, selectedArticleId])

  const selectedArticle = useMemo(
    () => articles?.find((article) => article.id === resolvedSelectedArticleId) ?? null,
    [articles, resolvedSelectedArticleId],
  )

  const selectedNotes = useMemo(() => {
    if (!selectedArticle) {
      return []
    }

    return noteFilter === 'ALL'
      ? selectedArticle.notes
      : selectedArticle.notes.filter((note) => note.type === noteFilter)
  }, [noteFilter, selectedArticle])

  const selectedArticleCollectionIds = useMemo(
    () => (selectedArticle ? articleCollectionIds[selectedArticle.id] ?? [] : []),
    [articleCollectionIds, selectedArticle],
  )

  const selectedArticleCollections = useMemo(
    () => collections.filter((collection) => selectedArticleCollectionIds.includes(collection.id)),
    [collections, selectedArticleCollectionIds],
  )

  const filteredSidebarCollections = useMemo(() => {
    const query = sidebarSectionSearchQuery.trim().toLowerCase()

    if (!query) {
      return collections
    }

    return collections.filter((collection) => collection.name.toLowerCase().includes(query))
  }, [collections, sidebarSectionSearchQuery])

  const filteredManageCollections = useMemo(() => {
    const query = manageSectionSearchQuery.trim().toLowerCase()

    if (!query) {
      return collections
    }

    return collections.filter((collection) => collection.name.toLowerCase().includes(query))
  }, [collections, manageSectionSearchQuery])

  function loadAiForArticle(articleId: string) {
    if (aiInitiated.current.has(articleId)) return
    aiInitiated.current.add(articleId)

    setAiCache((prev) => ({ ...prev, [articleId]: { status: 'PENDING' } }))

    fetchArticleAI(articleId)
      .then(({ status, result }) => {
        setAiCache((prev) => ({ ...prev, [articleId]: { status, result } }))
      })
      .catch(() => {
        setAiCache((prev) => ({ ...prev, [articleId]: { status: 'FAILED' } }))
      })
  }

  useEffect(() => {
    if (resolvedSelectedArticleId) {
      loadAiForArticle(resolvedSelectedArticleId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedSelectedArticleId])

  async function handleDelete(id: string) {
    await deleteArticle(id)
    setArticles((prev) => (prev ?? []).filter((article) => article.id !== id))
    await refreshCollections()
    try {
      await deleteArticleFromServer(id)
    } catch (error) {
      console.warn('Failed to delete article from server', error)
    }
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

  async function handleDeleteNote(articleId: string, noteId: string) {
    try {
      await deleteArticleNote(articleId, noteId)
      await deleteNoteFromServer(articleId, noteId)
      await refreshLibraryState()
    } catch (error) {
      console.error('Failed to delete note', error)
      await refreshLibraryState()
    }
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
      await refreshLibraryState()

      setDrafts((prev) => ({
        ...prev,
        [articleId]: createDraftState(),
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save the note.'
      updateDraft(articleId, { saving: false, error: message })
      await refreshLibraryState()
    }
  }

  async function handleToggleFavorite(article: OfflineArticle) {
    await setArticleFavorite(article.id, !article.isFavorite)
    await refreshArticles()
  }

  async function handleToggleReadLater(article: OfflineArticle) {
    await setArticleReadLater(article.id, !article.isReadLater)
    await refreshArticles()
  }

  async function handleCreateCollectionFromSidebar() {
    const name = newCollectionName.trim()

    if (!name) {
      setCollectionError('Add a name for the custom section.')
      return
    }

    try {
      await createCollection(name)
      setNewCollectionName('')
      setCollectionError('')
      setSidebarSectionSearchQuery('')
      await refreshCollections()
    } catch (error) {
      setCollectionError(error instanceof Error ? error.message : 'Failed to create custom section.')
    }
  }

  async function handleToggleCollectionMembership(articleId: string, collectionId: string) {
    const collectionIds = articleCollectionIds[articleId] ?? []

    if (collectionIds.includes(collectionId)) {
      await removeArticleFromCollection(articleId, collectionId)
    } else {
      await addArticleToCollection(articleId, collectionId)
    }

    await refreshCollections()
  }

  const systemSectionCounts = useMemo(
    () => ({
      ALL: articles?.length ?? 0,
      RECENT: articles?.length ?? 0,
      FAVORITES: articles?.filter((article) => article.isFavorite).length ?? 0,
      READ_LATER: articles?.filter((article) => article.isReadLater).length ?? 0,
    }),
    [articles],
  )

  if (articles === null) {
    return <div className="min-h-screen bg-slate-950 px-6 py-10 text-sm text-white">Loading library...</div>
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.22),_transparent_28%),linear-gradient(180deg,#f7fee7_0%,#f8fafc_34%,#eef2ff_100%)] px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-3 rounded-[28px] border border-white/70 bg-white/75 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500 text-sm font-semibold uppercase tracking-[0.24em] text-white">
              EG
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">Library</p>
              <p className="text-sm text-slate-500">{articles.length} saved articles</p>
            </div>
          </div>
        </div>

        {articles.length === 0 ? (
          <EmptyArticleState />
        ) : (
          <div className="grid gap-5 items-start xl:grid-cols-[236px_minmax(0,1.18fr)_minmax(380px,0.9fr)]">
            <aside className="rounded-[28px] border border-white/70 bg-white/82 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.07)] backdrop-blur sm:p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Sections</p>
                <div className="mt-4 space-y-2.5">
                  {systemSections.map((section) => (
                    <SectionButton
                      key={section.id}
                      active={selectedSection.type === 'system' && selectedSection.id === section.id}
                      title={section.label}
                      subtitle={section.description}
                      count={systemSectionCounts[section.id]}
                      onClick={() => setSelectedSection({ type: 'system', id: section.id })}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-6 border-t border-slate-100 pt-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Custom sections</p>
                  <span className="text-xs text-slate-400">{collections.length} total</span>
                </div>

                <div className="mt-4 space-y-3">
                  <input
                    type="search"
                    value={sidebarSectionSearchQuery}
                    onChange={(event) => setSidebarSectionSearchQuery(event.target.value)}
                    placeholder="Search custom sections"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400"
                  />

                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {filteredSidebarCollections.length === 0 ? (
                      <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                        No custom sections yet.
                      </div>
                    ) : (
                      filteredSidebarCollections.map((collection) => (
                        <button
                          key={collection.id}
                          onClick={() => setSelectedSection({ type: 'collection', id: collection.id })}
                          className={`w-full rounded-[18px] border px-4 py-3 text-left transition ${
                            selectedSection.type === 'collection' && selectedSection.id === collection.id
                              ? 'border-emerald-200 bg-emerald-50/80'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="truncate text-sm font-semibold text-slate-900">{collection.name}</span>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                              {(collectionArticleIds[collection.id] ?? []).length}
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>

                  <div className="border-t border-slate-100 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Create custom section</p>
                    <div className="mt-3 space-y-2">
                      <input
                        type="text"
                        value={newCollectionName}
                        onChange={(event) => {
                          setNewCollectionName(event.target.value)
                          setCollectionError('')
                        }}
                        placeholder="Custom section name"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400"
                      />
                      <button
                        onClick={() => void handleCreateCollectionFromSidebar()}
                        className="w-full rounded-2xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        Create custom section
                      </button>
                      {collectionError ? <p className="text-xs text-rose-500">{collectionError}</p> : null}
                    </div>
                  </div>
                </div>
              </div>

            </aside>

            <section className="rounded-[28px] border border-white/70 bg-white/82 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.07)] backdrop-blur sm:p-5">
              <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 px-2 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">
                    {selectedSection.type === 'system'
                      ? systemSections.find((section) => section.id === selectedSection.id)?.label ?? 'Saved articles'
                      : collections.find((collection) => collection.id === selectedSection.id)?.name ?? 'Custom section'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">{sectionArticles.length} articles in this view</p>
                </div>
                <div className="w-full sm:w-auto sm:min-w-[260px]">
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search by title"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400"
                  />
                </div>
              </div>

              <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-220px)] pr-1">
                {filteredArticles.map((article) => {
                  const counts = getNoteCounts(article.notes)
                  const isSelected = article.id === resolvedSelectedArticleId
                  const hostname = new URL(article.url).hostname
                  const faviconLetter = hostname[0]?.toUpperCase() ?? '?'

                  return (
                    <article
                      key={article.id}
                    className={`group rounded-[28px] border p-5 transition ${
                        isSelected
                          ? 'border-emerald-300 bg-emerald-50/80 shadow-[0_20px_45px_rgba(16,185,129,0.14)]'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80'
                      }`}
                    >
                      <button className="block w-full text-left" onClick={() => setSelectedArticleId(article.id)}>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold uppercase text-white">
                            {faviconLetter}
                          </span>
                          <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white">
                            {counts.total} notes
                          </span>
                          {article.syncStatus === 'PENDING_SYNC' ? (
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">
                              Pending sync
                            </span>
                          ) : null}
                        </div>

                        <h3 className="mt-4 max-w-[36rem] text-xl font-semibold leading-tight text-slate-950 transition group-hover:text-slate-700">
                          {article.title}
                        </h3>

                        {article.description ? (
                          <SafeNoteRenderer
                            as="p"
                            content={article.description}
                            maxLength={220}
                            className="mt-3 max-w-[44rem] overflow-hidden text-sm leading-6 text-slate-600"
                          />
                        ) : null}

                        <div className="mt-4 flex flex-wrap gap-2">
                          {article.isFavorite ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                              <StarIcon className="h-3.5 w-3.5" />
                              Favorite
                            </span>
                          ) : null}

                          {article.isReadLater ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                              <ClockIcon className="h-3.5 w-3.5" />
                              Read later
                            </span>
                          ) : null}

                          {noteTypeOptions.map((option) =>
                            counts[option.value] > 0 ? (
                              <NoteBadge key={option.value} type={option.value} count={counts[option.value]} />
                            ) : null,
                          )}
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                          <span>{formatDate(article.createdAt)}</span>
                          <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:block" />
                          <span>{hostname}</span>
                        </div>
                      </button>

                      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                        <div className="flex flex-wrap gap-2">
                          <SoftActionButton
                            active={article.isFavorite}
                            icon={<StarIcon className="h-3.5 w-3.5" />}
                            activeLabel="Favorited"
                            inactiveLabel="Favorite"
                            activeClassName="border-amber-200 bg-amber-50 text-amber-700"
                            onClick={() => void handleToggleFavorite(article)}
                          />

                          <SoftActionButton
                            active={article.isReadLater}
                            icon={<ClockIcon className="h-3.5 w-3.5" />}
                            activeLabel="Queued"
                            inactiveLabel="Read later"
                            activeClassName="border-sky-200 bg-sky-50 text-sky-700"
                            onClick={() => void handleToggleReadLater(article)}
                          />

                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                          >
                            Open source
                          </a>
                        </div>

                        <button
                          onClick={() => void handleDelete(article.id)}
                          className="rounded-full p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                          title="Delete article"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </article>
                  )
                })}
                {filteredArticles.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-slate-200 bg-white/70 px-5 py-10 text-center text-sm text-slate-500">
                    No articles match this search.
                  </div>
                ) : null}
              </div>
            </section>

            <aside className="sticky top-6 rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
              {selectedArticle ? (
                <div className="flex h-full flex-col">
                  <div className="border-b border-slate-100 p-6">
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
                        className="mt-3 text-sm leading-6 text-slate-600"
                      />
                    ) : null}

                    <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                      <span>{formatDate(selectedArticle.createdAt)}</span>
                      <span className="h-1 w-1 rounded-full bg-slate-600" />
                      <span>{selectedArticle.notes.length} total notes</span>
                    </div>
                  </div>

                  {aiCache[selectedArticle.id] ? (
                    <div className="border-b border-slate-100 p-6">
                      <AiPanel
                        status={aiCache[selectedArticle.id].status}
                        result={aiCache[selectedArticle.id].result}
                        onRetry={() => {
                          aiInitiated.current.delete(selectedArticle.id)
                          setAiCache((prev) => {
                            const next = { ...prev }
                            delete next[selectedArticle.id]
                            return next
                          })
                          loadAiForArticle(selectedArticle.id)
                        }}
                      />
                    </div>
                  ) : null}

                  <div className="border-b border-slate-100 p-6">
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

                  <div className="border-b border-slate-100 p-6">
                    <div className="mb-5 rounded-[24px] bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Article status</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <SoftActionButton
                          active={selectedArticle.isFavorite}
                          icon={<StarIcon className="h-4 w-4" />}
                          activeLabel="Favorite"
                          inactiveLabel="Add to favorites"
                          activeClassName="border-amber-200 bg-amber-50 text-amber-700"
                          onClick={() => void handleToggleFavorite(selectedArticle)}
                        />
                        <SoftActionButton
                          active={selectedArticle.isReadLater}
                          icon={<ClockIcon className="h-4 w-4" />}
                          activeLabel="Queued for later"
                          inactiveLabel="Read later"
                          activeClassName="border-sky-200 bg-sky-50 text-sky-700"
                          onClick={() => void handleToggleReadLater(selectedArticle)}
                        />
                      </div>
                    </div>

                    <div className="mb-5 rounded-[24px] bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Custom sections</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {selectedArticleCollections.length > 0
                              ? `${selectedArticleCollections.length} linked`
                              : 'No custom sections yet'}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setIsManageSectionsOpen((value) => !value)
                            setManageSectionSearchQuery('')
                            setCollectionError('')
                          }}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                        >
                          Manage custom sections
                        </button>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedArticleCollections.map((collection) => (
                          <span
                            key={collection.id}
                            className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                          >
                            {collection.name}
                          </span>
                        ))}
                        {selectedArticleCollections.length === 0 ? (
                          <span className="text-sm text-slate-400">This article is not grouped yet.</span>
                        ) : null}
                      </div>

                      {isManageSectionsOpen ? (
                        <div className="mt-4 rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
                          <div className="space-y-3">
                            <input
                              type="search"
                              value={manageSectionSearchQuery}
                              onChange={(event) => setManageSectionSearchQuery(event.target.value)}
                              placeholder="Filter custom sections"
                              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400"
                            />

                            <div className="flex max-h-52 flex-wrap gap-2 overflow-y-auto pr-1">
                              {filteredManageCollections.map((collection) => {
                                const active = selectedArticleCollectionIds.includes(collection.id)

                                return (
                                  <button
                                    key={collection.id}
                                    onClick={() => void handleToggleCollectionMembership(selectedArticle.id, collection.id)}
                                    className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                                      active
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                                    }`}
                                  >
                                    {active ? 'Selected' : 'Add'} {collection.name}
                                  </button>
                                )
                              })}
                              {filteredManageCollections.length === 0 ? (
                                <p className="text-sm text-slate-400">No matching custom sections.</p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">New note</p>
                      <div className="flex flex-wrap gap-2">
                        {noteTypeOptions.map((option) => {
                          const active = getDraft(selectedArticle.id).type === option.value

                          return (
                            <button
                              key={option.value}
                              onClick={() =>
                                updateDraft(selectedArticle.id, {
                                  type: option.value,
                                  error: '',
                                })
                              }
                              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                                active
                                  ? 'bg-emerald-400 text-slate-950'
                                  : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950'
                              }`}
                            >
                              {option.label}
                            </button>
                          )
                        })}
                      </div>

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
                        className="min-h-28 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-400"
                      />
                    </div>

                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-rose-500">
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
                      <h3 className="text-lg font-semibold text-slate-950">
                        {noteFilter === 'ALL' ? 'All notes' : `${getNoteTypeMeta(noteFilter).label} notes`}
                      </h3>
                      <span className="text-sm text-slate-500">{selectedNotes.length} shown</span>
                    </div>

                    {selectedNotes.length === 0 ? (
                      <EmptyNotesState />
                    ) : (
                      <div className="space-y-3">
                        {selectedNotes.map((note) => (
                          <article key={note.id} className="group rounded-[24px] border border-slate-100 bg-slate-50 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex flex-wrap items-center gap-3">
                                <NoteBadge type={note.type} />
                                <span className="text-xs text-slate-500">{formatDate(note.createdAt)}</span>
                              </div>
                              <button
                                onClick={() => void handleDeleteNote(selectedArticle.id, note.id)}
                                className="rounded-full p-1.5 text-slate-500 opacity-0 transition hover:bg-rose-400/10 hover:text-rose-400 group-hover:opacity-100"
                                title="Delete note"
                              >
                                <TrashIcon className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            <SafeNoteRenderer
                              as="p"
                              content={note.content}
                              className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-950"
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
