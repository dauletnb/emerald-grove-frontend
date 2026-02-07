import { saveArticleOffline } from './db';

chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
  if (message.type === 'SAVE_ARTICLE') {
    const article = message.payload;

    (async () => {
      try {
        const response = await fetch('http://localhost:8080/api/articles', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer mock-jwt-token',
          },
          body: JSON.stringify(article),
        });

        if (!response.ok) {
          throw new Error('Server error');
        }

        sendResponse({ status: 'success' });

      } catch (error) {
        console.warn('Сервер недоступен, сохраняем локально');

        await saveArticleOffline({
          id: crypto.randomUUID(),
          title: article.title,
          url: article.url,
          content: article.content,
          createdAt: Date.now(),
          syncStatus: 'PENDING_SYNC',
        });

        sendResponse({
          status: 'offline_saved',
          message: 'Сохранено локально',
        });
      }
    })();

    return true; // важно для async
  }
});