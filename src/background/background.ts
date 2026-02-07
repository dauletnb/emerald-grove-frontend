import { saveArticleOffline } from './db';
import { Article, MessageType, ExtensionMessage } from '../types'; // Импортируем наши правила

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _, sendResponse) => {
  
  // Вместо магических строк используем Enum (как switch по Enum в Java)
  if (message.type === MessageType.SAVE_ARTICLE) {
    const article: Article = message.payload;

    // Выносим логику в отдельную асинхронную функцию (Self-invoking async function)
    (async () => {
      try {
        const response = await fetch('http://localhost:8080/api/articles', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer mock-jwt-token',
          },
          body: JSON.stringify(article),
        });

        if (!response.ok) throw new Error('Server unreachable');

        sendResponse({ status: 'success' });
      } catch (error) {
        console.warn('Сервер недоступен, сохраняем локально через Repository');

        await saveArticleOffline({
          ...article, // Копируем все поля из статьи
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          syncStatus: 'PENDING_SYNC',
        });

        sendResponse({ status: 'offline_saved' });
      }
    })();

    return true; // Держим канал связи открытым (как асинхронный ответ в Spring)
  }
});