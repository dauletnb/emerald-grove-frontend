export type NoteType = 'IDEA' | 'TASK' | 'QUESTION'

export interface AIResult {
  summary: {
    short: string
    detailed: string
  }
  keyPoints: string[]
  tags: string[]
  highlights: {
    text: string
    explanation: string
  }[]
}

export type AIStatus = 'PENDING' | 'DONE' | 'FAILED'

export type SystemSection = 'ALL' | 'RECENT' | 'FAVORITES' | 'READ_LATER'

export interface ArticleNote {
  id: string
  type: NoteType
  content: string
  createdAt: number
}

export interface Article {
  id?: string
  title: string
  url: string
  description: string
  createdAt?: number
  updatedAt?: number
  syncStatus?: 'SYNCED' | 'PENDING_SYNC'
  notes?: ArticleNote[]
  isFavorite: boolean
  isReadLater: boolean
}

export interface ArticleCollection {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  syncStatus?: 'SYNCED' | 'PENDING_SYNC'
}

export interface ArticleCollectionLink {
  id: string
  articleId: string
  collectionId: string
  createdAt: number
  syncStatus?: 'SYNCED' | 'PENDING_SYNC'
}

export type LibrarySection =
  | { type: 'system'; id: SystemSection }
  | { type: 'collection'; id: string }

export enum MessageType {
  GET_PAGE_DATA = 'GET_PAGE_DATA',
  SAVE_ARTICLE = 'SAVE_ARTICLE',
}

export type GetPageDataMessage = {
  type: MessageType.GET_PAGE_DATA
}

export type SaveArticleMessage = {
  type: MessageType.SAVE_ARTICLE
  payload: Article
}

export enum SaveStatus {
  SUCCESS = 'success',
  UPDATED = 'updated',
  OFFLINE_SAVED = 'offline_saved',
  SERVER_ERROR = 'server_error',
  FAILED = 'failed',
}

export interface SaveArticleResponse {
  status: SaveStatus
  message?: string
}

export type ExtensionMessage = GetPageDataMessage | SaveArticleMessage
