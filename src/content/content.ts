import './styles.css'

// src/content/content.ts
console.log("Digital Garden content script loaded!");

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_PAGE_DATA') {
    const data = {
      title: document.title || "No Title",
      url: window.location.href,
      content: document.body.innerText.slice(0, 500) // берем кусочек текста
    };
    
    console.log("Отправляем данные в Popup:", data);
    sendResponse(data); 
  }
  return true; // Держим канал связи открытым
});