chrome.runtime.onInstalled.addListener(() => {
  console.log('Digital Garden installed');
});

// Адрес вашего будущего Spring Boot сервера
const API_URL = 'http://localhost:8080/api/articles';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SAVE_ARTICLE') {
    console.log('Отправка данных на бэкенд:', message.payload);

    // Выполняем реальный запрос к Java серверу
    fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message.payload), // Передаем данные из фронтенда
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Ошибка сервера: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        // Отправляем успешный ответ обратно в Popup/Content Script
        sendResponse({ 
          status: 'success', 
          data: data 
        });
      })
      .catch((error) => {
        console.error('Ошибка при сохранении:', error);
        sendResponse({ 
          status: 'error', 
          message: error.message 
        });
      });

    return true; // Важно: сообщаем Chrome, что ответ будет асинхронным
  }
});