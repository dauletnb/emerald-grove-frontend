// Это твой "Interface" или "POJO" из мира Java
export interface Article {
  id?: string;
  title: string;
  url: string;
  description: string;
  createdAt?: number;
  syncStatus?: 'SYNCED' | 'PENDING_SYNC';
}

// Это твой Enum для типов сообщений
export enum MessageType {
  GET_PAGE_DATA = 'GET_PAGE_DATA',
  SAVE_ARTICLE = 'SAVE_ARTICLE'
}

// Описание того, как выглядит сообщение
export type GetPageDataMessage = {
  type: MessageType.GET_PAGE_DATA;
};

export type SaveArticleMessage = {
  type: MessageType.SAVE_ARTICLE;
  payload: Article;
};

export type ExtensionMessage = GetPageDataMessage | SaveArticleMessage;
