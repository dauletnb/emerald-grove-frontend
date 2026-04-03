export type NoteType = 'IDEA' | 'TASK' | 'QUESTION'

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
}

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
}

export type ExtensionMessage = GetPageDataMessage | SaveArticleMessage
