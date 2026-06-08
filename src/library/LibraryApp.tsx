import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import DOMPurify from 'dompurify'
import { AiPanel } from '../components/AiPanel'
import { SafeNoteRenderer } from '../components/SafeNoteRenderer'
import { ApiAuthError } from '../shared/api/auth'
import {
  addArticleToCollectionOnServer,
  createCollectionOnServer,
  deleteCollectionOnServer,
  renameCollectionOnServer,
  fetchCollectionsSnapshotFromServer,
  removeArticleFromCollectionOnServer,
  syncDeletedCollectionLinksToServer,
  syncDeletedCollectionsToServer,
  syncCollectionLinksToServer,
  syncCollectionsToServer,
} from '../shared/api/collections'
import {
  addArticleNote,
  addArticleToCollection,
  clearPendingArticleDeletions,
  clearPendingCollectionDeletions,
  clearPendingCollectionLinkDeletions,
  createCollection,
  deleteArticle,
  deleteArticleNote,
  deleteCollection,
  getAllCollections,
  getAllArticles,
  getPendingArticleDeletions,
  getPendingCollectionDeletions,
  getPendingCollectionLinkDeletions,
  getCollectionArticleIds,
  getPendingCollectionLinksForSync,
  getPendingCollectionsForSync,
  removeArticleFromCollection,
  renameCollection,
  replaceCollectionsState,
  saveCollectionOffline,
  saveArticleOffline,
  saveArticlesOffline,
  setArticleFavorite,
  setArticleReadLater,
  updateArticleNote,
  type OfflineArticle,
} from '../shared/repository/db'
import {
  deleteArticleFromServer,
  deleteNoteFromServer,
  fetchArticleAI,
  fetchArticlesFromServer,
  retryArticleAI,
  syncArticleToServer,
  syncDeletedArticlesToServer,
  updateNoteOnServer,
  type BatchSyncResponse,
} from '../shared/api/articles'
import type { AIResult, AIStatus } from '../shared/types'
import type { ArticleCollection, ArticleNote, LibrarySection, NoteType, SystemSection } from '../shared/types'
import type { CollectionLinkBatchSyncResponse } from '../shared/api/collections'

const noteTypeOptions: Array<{ value: NoteType; label: string; badgeClass: string; dotClass: string }> = [
  { value: 'IDEA', label: 'Идея', badgeClass: 'bg-emerald-100 text-emerald-800', dotClass: 'bg-emerald-500' },
  { value: 'TASK', label: 'Задача', badgeClass: 'bg-amber-100 text-amber-800', dotClass: 'bg-amber-500' },
  { value: 'QUESTION', label: 'Вопрос', badgeClass: 'bg-indigo-100 text-indigo-800', dotClass: 'bg-indigo-500' },
]

const noteFilters = ['ALL', 'IDEA', 'TASK', 'QUESTION'] as const
const NOTE_CONTENT_MAX_LENGTH = 500

type NoteFilter = (typeof noteFilters)[number]

type DraftState = {
  type: NoteType
  content: string
  saving: boolean
  error: string
}

const systemSections: Array<{ id: SystemSection; label: string }> = [
  { id: 'ALL', label: 'Все' },
  { id: 'RECENT', label: 'Недавние' },
  { id: 'FAVORITES', label: 'Избранное' },
  { id: 'READ_LATER', label: 'Прочитать позже' },
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

function normalizeTimestamp(value: number): number {
  // Backend may return epoch seconds instead of milliseconds.
  // Any value below 1e12 (~Sep 2001 in ms) is almost certainly seconds.
  return value < 1e12 ? value * 1000 : value
}

function formatDate(value: number) {
  return new Date(normalizeTimestamp(value)).toLocaleString('ru-RU', {
    timeZone: 'Asia/Almaty',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
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
      className={`${
        active
          ? 'text-emerald-700 font-semibold underline underline-offset-4'
          : 'text-slate-400 hover:text-slate-700 transition'
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
  count,
  onClick,
}: {
  active: boolean
  title: string
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
      <h2 className="text-xl font-semibold text-slate-900">Библиотека пока пуста</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">
        Сначала сохраните несколько статей, а потом мы превратим их в рабочие заметки, вопросы, идеи и следующие шаги.
      </p>
    </div>
  )
}

function EmptyNotesState() {
  return (
    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm leading-6 text-slate-500">
      Заметок пока нет. Начните с вопроса, зафиксируйте идею реализации или превратите статью в конкретную задачу.
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
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null)
  const [selectedSection, setSelectedSection] = useState<LibrarySection>({ type: 'system', id: 'ALL' })
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({})
  const [noteFilter, setNoteFilter] = useState<NoteFilter>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [newCollectionName, setNewCollectionName] = useState('')
  const [collectionError, setCollectionError] = useState('')
  const [readingMode, setReadingMode] = useState(false)
  const [sidebarSectionSearchQuery, setSidebarSectionSearchQuery] = useState('')
  const [showCreateInput, setShowCreateInput] = useState(false)
  const [aiCache, setAiCache] = useState<Record<string, { status: AIStatus; result?: AIResult }>>({})
  const [authMessage, setAuthMessage] = useState('')
  const [editingNote, setEditingNote] = useState<{ noteId: string; type: NoteType; content: string; saving: boolean } | null>(null)
  const [renamingCollectionId, setRenamingCollectionId] = useState<string | null>(null)
  const [renamingCollectionName, setRenamingCollectionName] = useState('')
  const aiInitiated = useRef<Set<string>>(new Set())
  const collectionsSyncRef = useRef<Promise<void> | null>(null)

  function updateAuthMessage(error: unknown, fallback: string) {
    if (error instanceof ApiAuthError) {
      setAuthMessage(error.message)
      return true
    }

    if (fallback) {
      setAuthMessage(fallback)
    }

    return false
  }

  function summarizeBatchSync(label: string, result: BatchSyncResponse | CollectionLinkBatchSyncResponse): string {
    if (result.skippedCount === 0) {
      return ''
    }

    const reasons = result.skipped
      .slice(0, 3)
      .map((item) => item.reason ?? 'UNKNOWN_REASON')
      .join(', ')

    return `${label}: skipped ${result.skippedCount} item(s) (${reasons}).`
  }

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
  }

  async function refreshLibraryState() {
    await Promise.all([refreshArticles(), refreshCollections()])
  }

  async function syncCollectionsFromServer() {
    const snapshot = await fetchCollectionsSnapshotFromServer()
    await replaceCollectionsState(snapshot.collections, snapshot.links)
  }

  async function syncPendingCollections() {
    if (collectionsSyncRef.current) {
      await collectionsSyncRef.current
      return
    }

    const syncPromise = (async () => {
      const pendingCollections = await getPendingCollectionsForSync()
      const syncMessages: string[] = []

      if (pendingCollections.length > 0) {
        const result = await syncCollectionsToServer(pendingCollections)
        const message = summarizeBatchSync('Collection sync', result)
        if (message) syncMessages.push(message)
      }

      const pendingCollectionDeletions = await getPendingCollectionDeletions()

      if (pendingCollectionDeletions.length > 0) {
        const result = await syncDeletedCollectionsToServer(pendingCollectionDeletions)
        if (result.skippedCount === 0) {
          await clearPendingCollectionDeletions(pendingCollectionDeletions)
        }
        const message = summarizeBatchSync('Collection deletion sync', result)
        if (message) syncMessages.push(message)
      }

      const pendingLinks = await getPendingCollectionLinksForSync()

      if (pendingLinks.length > 0) {
        const result = await syncCollectionLinksToServer(pendingLinks)
        const message = summarizeBatchSync('Collection link sync', result)
        if (message) syncMessages.push(message)
      }

      const pendingLinkDeletions = await getPendingCollectionLinkDeletions()

      if (pendingLinkDeletions.length > 0) {
        const result = await syncDeletedCollectionLinksToServer(pendingLinkDeletions)
        if (result.skippedCount === 0) {
          await clearPendingCollectionLinkDeletions(pendingLinkDeletions.map((item) => item.externalId))
        }
        const message = summarizeBatchSync('Collection link deletion sync', result)
        if (message) syncMessages.push(message)
      }

      await syncCollectionsFromServer()
      setCollectionError(syncMessages.join(' '))
    })()

    collectionsSyncRef.current = syncPromise

    try {
      await syncPromise
    } finally {
      collectionsSyncRef.current = null
    }
  }

  async function syncArticlesWithServer() {
    const localArticles = await getAllArticles()
    const syncMessages: string[] = []

    for (const article of localArticles.filter((item) => item.syncStatus === 'PENDING_SYNC')) {
      const synced = await syncArticleToServer(article)
      await saveArticleOffline(synced.article)
    }

    const pendingArticleDeletions = await getPendingArticleDeletions()

    if (pendingArticleDeletions.length > 0) {
      const result = await syncDeletedArticlesToServer(pendingArticleDeletions)
      if (result.skippedCount === 0) {
        await clearPendingArticleDeletions(pendingArticleDeletions)
      }
      const message = summarizeBatchSync('Article deletion sync', result)
      if (message) syncMessages.push(message)
    }

    const remoteArticles = await fetchArticlesFromServer()
    await saveArticlesOffline(remoteArticles)
    setAuthMessage(syncMessages.join(' '))
  }

  useEffect(() => {
    let cancelled = false

    const startLoadingLibrary = async () => {
      await refreshLibraryState()

      try {
        await syncArticlesWithServer()
        await syncPendingCollections()
        setAuthMessage('')
      } catch (error) {
        updateAuthMessage(error, '')
        console.warn('Library sync failed', error)
      }

      if (!cancelled) {
        await refreshLibraryState()
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

  const filteredSidebarCollections = useMemo(() => {
    const query = sidebarSectionSearchQuery.trim().toLowerCase()

    if (!query) {
      return collections
    }

    return collections.filter((collection) => collection.name.toLowerCase().includes(query))
  }, [collections, sidebarSectionSearchQuery])

  const aiPollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const aiPollingArticleId = useRef<string | null>(null)
  const AI_POLL_INTERVAL_MS = 4_000
  const AI_POLL_MAX_ATTEMPTS = 10

  function stopAiPolling() {
    if (aiPollTimer.current !== null) {
      clearTimeout(aiPollTimer.current)
      aiPollTimer.current = null
    }
    if (aiPollingArticleId.current !== null) {
      aiInitiated.current.delete(aiPollingArticleId.current)
      aiPollingArticleId.current = null
    }
  }

  function startAiPolling(articleId: string, attempt = 0) {
    if (attempt >= AI_POLL_MAX_ATTEMPTS) {
      setAiCache((prev) => ({ ...prev, [articleId]: { status: 'FAILED' } }))
      return
    }

    fetchArticleAI(articleId)
      .then(({ status, result }) => {
        setAuthMessage('')
        setAiCache((prev) => ({ ...prev, [articleId]: { status, result } }))
        if (status === 'PENDING') {
          aiPollTimer.current = setTimeout(() => startAiPolling(articleId, attempt + 1), AI_POLL_INTERVAL_MS)
        } else {
          aiPollingArticleId.current = null
        }
      })
      .catch((error) => {
        updateAuthMessage(error, '')
        setAiCache((prev) => ({ ...prev, [articleId]: { status: 'FAILED' } }))
        aiPollingArticleId.current = null
      })
  }

  function loadAiForArticle(articleId: string) {
    if (aiInitiated.current.has(articleId)) return
    aiInitiated.current.add(articleId)
    aiPollingArticleId.current = articleId

    const currentStatus = aiCache[articleId]?.status
    if (currentStatus === 'FAILED' || currentStatus === 'PERMANENT_FAILED') {
      retryArticleAI(articleId).catch((err) => updateAuthMessage(err, ''))
    }
    setAiCache((prev) => ({ ...prev, [articleId]: { status: 'PENDING' } }))
    startAiPolling(articleId)
  }

  useEffect(() => {
    stopAiPolling()
    if (resolvedSelectedArticleId) {
      loadAiForArticle(resolvedSelectedArticleId)
    }
    setReadingMode(false)
    return () => stopAiPolling()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedSelectedArticleId])

  async function handleDelete(id: string) {
    await deleteArticle(id)
    setArticles((prev) => (prev ?? []).filter((article) => article.id !== id))
    await refreshCollections()
    try {
      await deleteArticleFromServer(id)
      await clearPendingArticleDeletions([id])
      setAuthMessage('')
    } catch (error) {
      updateAuthMessage(error, '')
      console.warn('Failed to delete article from server', error)
    }
  }

  async function handleDeleteCollection(collectionId: string) {
    await deleteCollection(collectionId)
    setCollections((prev) => prev.filter((collection) => collection.id !== collectionId))
    await refreshCollections()
    try {
      await deleteCollectionOnServer(collectionId)
      await clearPendingCollectionDeletions([collectionId])
      setCollectionError('')
    } catch (error) {
      if (updateAuthMessage(error, '')) {
        setCollectionError(error instanceof Error ? error.message : 'Failed to delete collection.')
      }
      console.warn('Failed to delete collection from server', error)
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
      setAuthMessage('')
      await refreshLibraryState()
    } catch (error) {
      updateAuthMessage(error, '')
      console.error('Failed to delete note', error)
      await refreshLibraryState()
    }
  }

  async function handleUpdateNote(articleId: string, noteId: string) {
    if (!editingNote || editingNote.noteId !== noteId) return
    const content = editingNote.content.trim()
    if (!content) return

    setEditingNote((prev) => prev ? { ...prev, saving: true } : null)

    try {
      await updateArticleNote(articleId, noteId, { type: editingNote.type, content })
      await updateNoteOnServer(articleId, noteId, { type: editingNote.type, content })
      setAuthMessage('')
      setEditingNote(null)
      await refreshLibraryState()
    } catch (error) {
      updateAuthMessage(error, '')
      setEditingNote((prev) => prev ? { ...prev, saving: false } : null)
      console.error('Failed to update note', error)
      await refreshLibraryState()
    }
  }

  async function handleToggleArticleInCollection(articleId: string, collectionId: string) {
    const isIn = (collectionArticleIds[collectionId] ?? []).includes(articleId)
    try {
      if (isIn) {
        await removeArticleFromCollection(articleId, collectionId)
        await refreshCollections()
        await removeArticleFromCollectionOnServer(collectionId, articleId)
      } else {
        await addArticleToCollection(articleId, collectionId)
        await refreshCollections()
        await addArticleToCollectionOnServer(collectionId, articleId)
      }
      setAuthMessage('')
    } catch (error) {
      updateAuthMessage(error, '')
      console.warn('Failed to toggle article in collection', error)
      await refreshCollections()
    }
  }

  async function handleAddNote(articleId: string) {
    const draft = getDraft(articleId)
    const content = draft.content.trim()

    if (!content) {
      updateDraft(articleId, { error: 'Перед сохранением добавьте короткую заметку.' })
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
      setAuthMessage('')
      await refreshLibraryState()

      setDrafts((prev) => ({
        ...prev,
        [articleId]: createDraftState(),
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось сохранить заметку.'
      updateAuthMessage(error, '')
      updateDraft(articleId, { saving: false, error: message })
      await refreshLibraryState()
    }
  }

  async function handleToggleFavorite(article: OfflineArticle) {
    const localArticle = await setArticleFavorite(article.id, !article.isFavorite)
    await refreshArticles()

    try {
      const syncedArticle = await syncArticleToServer(localArticle)
      await saveArticleOffline(syncedArticle.article)
      setAuthMessage('')
    } catch (error) {
      updateAuthMessage(error, '')
      console.warn('Failed to sync favorite state', error)
    } finally {
      await refreshArticles()
    }
  }

  async function handleToggleReadLater(article: OfflineArticle) {
    const localArticle = await setArticleReadLater(article.id, !article.isReadLater)
    await refreshArticles()

    try {
      const syncedArticle = await syncArticleToServer(localArticle)
      await saveArticleOffline(syncedArticle.article)
      setAuthMessage('')
    } catch (error) {
      updateAuthMessage(error, '')
      console.warn('Failed to sync read-later state', error)
    } finally {
      await refreshArticles()
    }
  }

  async function handleCreateCollectionFromSidebar() {
    const name = newCollectionName.trim()

    if (!name) {
      setCollectionError('Enter a collection name first.')
      return
    }

    try {
      const serverCollection = await createCollectionOnServer(name)
      await saveCollectionOffline(serverCollection)
      setNewCollectionName('')
      setCollectionError('')
      setSidebarSectionSearchQuery('')
      await refreshCollections()
    } catch (error) {
      if (updateAuthMessage(error, '')) {
        setCollectionError(error instanceof Error ? error.message : 'Please sign in again.')
        return
      }

      try {
        await createCollection(name, { syncStatus: 'PENDING_SYNC' })
        setNewCollectionName('')
        setCollectionError('Collection saved locally and will sync when the server is reachable.')
        setSidebarSectionSearchQuery('')
        await refreshCollections()
      } catch (localError) {
        setCollectionError(localError instanceof Error ? localError.message : 'Failed to create collection.')
      }
    }
  }

  async function handleRenameCollection(collectionId: string) {
    const name = renamingCollectionName.trim()

    if (!name) {
      setRenamingCollectionId(null)
      setRenamingCollectionName('')
      return
    }

    try {
      const serverCollection = await renameCollectionOnServer(collectionId, name)
      await saveCollectionOffline(serverCollection)
      setCollectionError('')
      setAuthMessage('')
    } catch (error) {
      if (!updateAuthMessage(error, '')) {
        try {
          await renameCollection(collectionId, name)
          setCollectionError('Переименовано локально. Синхронизируется при подключении к серверу.')
        } catch (localError) {
          setCollectionError(localError instanceof Error ? localError.message : 'Не удалось переименовать раздел.')
        }
      }
    }

    setRenamingCollectionId(null)
    setRenamingCollectionName('')
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
    return <div className="min-h-screen bg-slate-950 px-6 py-10 text-sm text-white">Загрузка библиотеки...</div>
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.12),_transparent_60%),linear-gradient(180deg,#f7fee7_0%,#f8fafc_34%,#eef2ff_100%)] px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-3 rounded-[28px] border border-white/70 bg-white/75 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500 text-sm font-semibold uppercase tracking-[0.24em] text-white">
              ЦБ
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">Цифровая библиотека</p>
              <p className="text-sm text-slate-500">{articles.length} сохранённых статей</p>
            </div>
          </div>
        </div>

        {authMessage ? (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-[0_10px_30px_rgba(120,53,15,0.08)]">
            {authMessage}
          </div>
        ) : null}

        {articles.length === 0 ? (
          <EmptyArticleState />
        ) : (
          <div className="grid gap-5 items-start xl:grid-cols-[236px_minmax(0,1.18fr)_minmax(380px,0.9fr)]">
            <aside className="rounded-[28px] border border-white/70 bg-white/82 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.07)] backdrop-blur sm:p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Разделы</p>
                <div className="mt-4 space-y-2.5">
                  {systemSections.map((section) => (
                    <SectionButton
                      key={section.id}
                      active={selectedSection.type === 'system' && selectedSection.id === section.id}
                      title={section.label}
                      count={systemSectionCounts[section.id]}
                      onClick={() => setSelectedSection({ type: 'system', id: section.id })}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-6 border-t border-slate-100 pt-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Мои разделы</p>
                  <button
                    onClick={() => setShowCreateInput(!showCreateInput)}
                    className="rounded-full p-1 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600"
                    title="Создать раздел"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {collections.length >= 8 && (
                    <input
                      type="search"
                      value={sidebarSectionSearchQuery}
                      onChange={(event) => setSidebarSectionSearchQuery(event.target.value)}
                      placeholder="Поиск по пользовательским разделам"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400"
                    />
                  )}

                  <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                    {filteredSidebarCollections.length === 0 ? (
                      <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                        Пользовательских разделов пока нет.
                      </div>
                    ) : (
                      filteredSidebarCollections.map((collection) => (
                        <div
                          key={collection.id}
                          className={`flex items-center gap-2 rounded-[18px] border px-4 py-3 transition ${
                            selectedSection.type === 'collection' && selectedSection.id === collection.id
                              ? 'border-emerald-200 bg-emerald-50/80'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          {renamingCollectionId === collection.id ? (
                            <input
                              type="text"
                              value={renamingCollectionName}
                              onChange={(event) => setRenamingCollectionName(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') void handleRenameCollection(collection.id)
                                if (event.key === 'Escape') {
                                  setRenamingCollectionId(null)
                                  setRenamingCollectionName('')
                                }
                              }}
                              onBlur={() => void handleRenameCollection(collection.id)}
                              autoFocus
                              className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 outline-none focus:border-emerald-400"
                            />
                          ) : (
                            <>
                              <button
                                onClick={() => setSelectedSection({ type: 'collection', id: collection.id })}
                                className="flex-1 text-left"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <span className="truncate text-sm font-semibold text-slate-900">{collection.name}</span>
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                                    {(collectionArticleIds[collection.id] ?? []).length}
                                  </span>
                                </div>
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setRenamingCollectionId(collection.id)
                                  setRenamingCollectionName(collection.name)
                                }}
                                className="rounded-full p-1.5 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600"
                                title="Переименовать раздел"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void handleDeleteCollection(collection.id)
                                }}
                                className="rounded-full p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                                title="Удалить раздел"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {showCreateInput && (
                    <div className="border-t border-slate-100 pt-3">
                      <input
                        type="text"
                        value={newCollectionName}
                        onChange={(event) => {
                          setNewCollectionName(event.target.value)
                          setCollectionError('')
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            void handleCreateCollectionFromSidebar()
                            setShowCreateInput(false)
                          }
                          if (event.key === 'Escape') {
                            setShowCreateInput(false)
                            setNewCollectionName('')
                            setCollectionError('')
                          }
                        }}
                        onBlur={() => {
                          setShowCreateInput(false)
                          setNewCollectionName('')
                          setCollectionError('')
                        }}
                        placeholder="Название раздела"
                        autoFocus
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400"
                      />
                      {collectionError ? <p className="mt-2 text-xs text-rose-500">{collectionError}</p> : null}
                    </div>
                  )}
                </div>
              </div>

            </aside>

            <section className="rounded-[28px] border border-white/70 bg-white/82 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.07)] backdrop-blur sm:p-5">
              <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 px-2 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">
                    {selectedSection.type === 'system'
                      ? systemSections.find((section) => section.id === selectedSection.id)?.label ?? 'Сохранённые статьи'
                      : collections.find((collection) => collection.id === selectedSection.id)?.name ?? 'Пользовательский раздел'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">Статей в этом представлении: {sectionArticles.length}</p>
                </div>
                <div className="w-full sm:w-auto sm:min-w-[260px]">
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Поиск по названию"
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
                    className={`group rounded-[28px] border p-4 transition ${
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
                            {counts.total} заметок
                          </span>
                          {article.syncStatus === 'PENDING_SYNC' ? (
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">
                              Ожидает синхронизации
                            </span>
                          ) : null}
                        </div>

                        <h3 className="mt-4 max-w-[36rem] text-lg font-semibold leading-tight text-slate-950 transition group-hover:text-slate-700">
                          {article.title}
                        </h3>

                        <div className="mt-3 flex flex-wrap gap-2">
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

                      <div className={`mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 ${isSelected ? 'flex' : 'hidden group-hover:flex'}`}>
                        <div className="flex flex-wrap gap-2">
                          <SoftActionButton
                            active={article.isFavorite}
                            icon={<StarIcon className="h-3.5 w-3.5" />}
                            activeLabel="В избранном"
                            inactiveLabel="В избранное"
                            activeClassName="border-amber-200 bg-amber-50 text-amber-700"
                            onClick={() => void handleToggleFavorite(article)}
                          />

                          <SoftActionButton
                            active={article.isReadLater}
                            icon={<ClockIcon className="h-3.5 w-3.5" />}
                            activeLabel="Отложено"
                            inactiveLabel="Прочитать позже"
                            activeClassName="border-sky-200 bg-sky-50 text-sky-700"
                            onClick={() => void handleToggleReadLater(article)}
                          />

                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                          >
                            Открыть источник
                          </a>
                        </div>

                        <button
                          onClick={() => void handleDelete(article.id)}
                          className="rounded-full p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                          title="Удалить статью"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </article>
                  )
                })}
                {filteredArticles.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-slate-200 bg-white/70 px-5 py-10 text-center text-sm text-slate-500">
                    По этому запросу статьи не найдены.
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

                    <h2 className="mt-3 text-xl font-semibold leading-tight">{selectedArticle.title}</h2>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{formatDate(selectedArticle.createdAt)}</span>
                      <span className="h-1 w-1 rounded-full bg-slate-400" />
                      <span>Всего заметок: {selectedArticle.notes.length}</span>
                    </div>
                  </div>

                  {selectedArticle.content ? (
                    <div className="flex border-b border-slate-100">
                      <button
                        onClick={() => setReadingMode(false)}
                        className={`flex-1 py-3 text-sm font-semibold transition border-b-2 ${!readingMode ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                      >
                        Заметки
                      </button>
                      <button
                        onClick={() => setReadingMode(true)}
                        className={`flex-1 py-3 text-sm font-semibold transition border-b-2 ${readingMode ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                      >
                        Читать
                      </button>
                    </div>
                  ) : null}

                  {readingMode && selectedArticle.content ? (
                    <div className="flex-1 overflow-y-auto">
                      {aiCache[selectedArticle.id] ? (
                        <div className={aiCache[selectedArticle.id].status === 'DONE' ? 'p-6' : 'border-b border-slate-100 px-6 py-4'}>
                          <AiPanel
                            status={aiCache[selectedArticle.id].status}
                            result={aiCache[selectedArticle.id].result}
                            onRetry={() => {
                              aiInitiated.current.delete(selectedArticle.id)
                              loadAiForArticle(selectedArticle.id)
                            }}
                          />
                        </div>
                      ) : null}
                      {aiCache[selectedArticle.id]?.status !== 'DONE' ? (
                        <div className="p-6">
                          <div
                            className="article-content"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedArticle.content) }}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {!readingMode ? (
                  <>
                  <div className="border-b border-slate-100 p-6">
                    <div className="space-y-3">
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
                              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
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
                        placeholder="Запишите вопрос, идею реализации или следующую задачу, пока статья ещё свежа в памяти."
                        rows={3}
                        maxLength={NOTE_CONTENT_MAX_LENGTH}
                        className="min-h-20 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-400"
                      />
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <p className="text-xs text-slate-400">
                        {getDraft(selectedArticle.id).error || `${getDraft(selectedArticle.id).content.length}/${NOTE_CONTENT_MAX_LENGTH}`}
                      </p>
                      <button
                        onClick={() => void handleAddNote(selectedArticle.id)}
                        disabled={getDraft(selectedArticle.id).saving}
                        className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                          getDraft(selectedArticle.id).saving
                            ? 'cursor-wait bg-slate-600 text-slate-200'
                            : 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
                        }`}
                      >
                        {getDraft(selectedArticle.id).saving ? 'Сохранение...' : 'Добавить заметку'}
                      </button>
                    </div>
                  </div>

                  {collections.length > 0 ? (
                    <div className="border-b border-slate-100 px-6 py-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">Коллекции</p>
                      <div className="flex flex-wrap gap-2">
                        {collections.map((collection) => {
                          const isIn = (collectionArticleIds[collection.id] ?? []).includes(selectedArticle.id)
                          return (
                            <button
                              key={collection.id}
                              onClick={() => void handleToggleArticleInCollection(selectedArticle.id, collection.id)}
                              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                                isIn
                                  ? 'bg-emerald-400 text-slate-950'
                                  : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950'
                              }`}
                            >
                              {collection.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="border-b border-slate-100 px-6 py-2">
                    <div className="flex flex-wrap gap-2">
                      {noteFilters.map((filter) => (
                        <FilterChip
                          key={filter}
                          active={noteFilter === filter}
                          onClick={() => setNoteFilter(filter)}
                        >
                          {filter === 'ALL' ? 'Все заметки' : getNoteTypeMeta(filter).label}
                        </FilterChip>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 p-6">

                    {selectedNotes.length === 0 ? (
                      <EmptyNotesState />
                    ) : (
                      <div className="space-y-3">
                        {selectedNotes.map((note) => (
                          <article key={note.id} className="group rounded-[24px] border border-slate-100 bg-slate-50 p-4">
                            {editingNote?.noteId === note.id ? (
                              <div className="space-y-3">
                                <div className="flex flex-wrap gap-2">
                                  {noteTypeOptions.map((option) => (
                                    <button
                                      key={option.value}
                                      onClick={() => setEditingNote((prev) => prev ? { ...prev, type: option.value } : null)}
                                      className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                                        editingNote.type === option.value
                                          ? 'bg-emerald-400 text-slate-950'
                                          : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950'
                                      }`}
                                    >
                                      {option.label}
                                    </button>
                                  ))}
                                </div>
                                <textarea
                                  value={editingNote.content}
                                  onChange={(event) => setEditingNote((prev) => prev ? { ...prev, content: event.target.value } : null)}
                                  rows={3}
                                  maxLength={NOTE_CONTENT_MAX_LENGTH}
                                  className="min-h-20 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-400"
                                />
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs text-slate-400">{editingNote.content.length}/{NOTE_CONTENT_MAX_LENGTH}</p>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => setEditingNote(null)}
                                      className="rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300"
                                    >
                                      Отмена
                                    </button>
                                    <button
                                      onClick={() => void handleUpdateNote(selectedArticle.id, note.id)}
                                      disabled={editingNote.saving || !editingNote.content.trim()}
                                      className={`rounded-2xl px-3 py-1.5 text-xs font-semibold transition ${
                                        editingNote.saving
                                          ? 'cursor-wait bg-slate-600 text-slate-200'
                                          : 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
                                      }`}
                                    >
                                      {editingNote.saving ? 'Сохранение...' : 'Сохранить'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex flex-wrap items-center gap-3">
                                    <NoteBadge type={note.type} />
                                    <span className="text-xs text-slate-500">{formatDate(note.createdAt)}</span>
                                  </div>
                                  <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                                    <button
                                      onClick={() => setEditingNote({ noteId: note.id, type: note.type, content: note.content, saving: false })}
                                      className="rounded-full p-1.5 text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-600"
                                      title="Редактировать заметку"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => void handleDeleteNote(selectedArticle.id, note.id)}
                                      className="rounded-full p-1.5 text-slate-500 transition hover:bg-rose-400/10 hover:text-rose-400"
                                      title="Удалить заметку"
                                    >
                                      <TrashIcon className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>

                                <SafeNoteRenderer
                                  as="p"
                                  content={note.content}
                                  className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-950"
                                />
                              </>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                  </>) : null}
                </div>
              ) : (
                <div className="flex h-full min-h-[420px] items-center justify-center p-8 text-center text-sm text-slate-400">
                  Выберите статью, чтобы просмотреть её заметки.
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}
