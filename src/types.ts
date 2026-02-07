// Это твой "Interface" или "POJO" из мира Java
export interface Article {
  id?: string;
  title: string;
  url: string;
  content: string;
  createdAt?: number;
  syncStatus?: 'SYNCED' | 'PENDING_SYNC';
}

// Это твой Enum для типов сообщений
export enum MessageType {
  GET_PAGE_DATA = 'GET_PAGE_DATA',
  SAVE_ARTICLE = 'SAVE_ARTICLE'
}

// Описание того, как выглядит сообщение
export interface ExtensionMessage {
  type: MessageType;
  payload?: any;
}