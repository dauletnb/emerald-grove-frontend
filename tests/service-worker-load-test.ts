import { test, expect } from '@playwright/test'

/**
 * Load тест для проверки надежности Service Worker при синхронизации 100+ закладок
 */
test.describe('Service Worker Load Testing', () => {
  test.beforeEach(async ({ context }) => {
    // Устанавливаем расширение перед каждым тестом
    const extensionPath = './dist'
    await context.addInitScript(() => {
      // Имитация установки расширения
    })
  })

  test('SW не засыпает при синхронизации 100+ закладок', async ({ page }) => {
    // Генерируем тестовые данные
    const testArticles = Array.from({ length: 150 }, (_, i) => ({
      id: `test-article-${i}`,
      title: `Тестовая статья ${i}`,
      url: `https://example.com/article/${i}`,
      description: `Описание тестовой статьи ${i} с достаточным количеством контента для проверки производительности`,
      notes: [
        {
          id: `note-${i}-1`,
          type: 'IDEA',
          content: `Идея для статьи ${i}`,
          createdAt: Date.now()
        },
        {
          id: `note-${i}-2`, 
          type: 'TASK',
          content: `Задача для статьи ${i}`,
          createdAt: Date.now()
        }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }))

    // Открываем popup расширения
    await page.goto('chrome-extension://your-extension-id/popup.html')
    
    // Начинаем мониторинг состояния SW
    const swLogs: string[] = []
    page.on('console', msg => {
      if (msg.text().includes('keep-alive') || msg.text().includes('синхронизацию')) {
        swLogs.push(msg.text())
      }
    })

    // Запускаем синхронизацию всех статей
    const startTime = Date.now()
    
    for (const article of testArticles) {
      await page.evaluate((articleData) => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage({
            type: 'SAVE_ARTICLE',
            payload: articleData
          }, (response) => {
            resolve(response)
          })
        })
      }, article)
    }

    const endTime = Date.now()
    const totalTime = endTime - startTime

    // Проверяем результаты
    console.log(`Синхронизация ${testArticles.length} статей заняла ${totalTime}ms`)
    console.log('Логи Service Worker:', swLogs)

    // Asserts
    expect(totalTime).toBeLessThan(30000) // Не более 30 секунд
    expect(swLogs.some(log => log.includes('keep-alive mechanism started'))).toBeTruthy()
    expect(swLogs.some(log => log.includes('keep-alive mechanism stopped'))).toBeFalsy() // SW не должен был уснуть
    
    // Проверяем, что все статьи сохранены
    const savedArticles = await page.evaluate(() => {
      return new Promise((resolve) => {
        chrome.storage.local.get(['articles'], (result) => {
          resolve(result.articles || [])
        })
      })
    })

    expect(Array.isArray(savedArticles)).toBeTruthy()
    expect(savedArticles.length).toBe(testArticles.length)
  })

  test('Keep-alive механизм работает при долгих операциях', async ({ page }) => {
    await page.goto('chrome-extension://your-extension-id/popup.html')
    
    // Имитируем долгую операцию (10+ секунд)
    const longOperationResult = await page.evaluate(() => {
      return new Promise((resolve) => {
        const startTime = Date.now()
        
        chrome.runtime.sendMessage({
          type: 'LONG_OPERATION',
          payload: { duration: 15000 } // 15 секунд
        }, (response) => {
          const endTime = Date.now()
          resolve({
            success: response.status !== 'error',
            duration: endTime - startTime
          })
        })
      })
    })

    expect(longOperationResult.success).toBeTruthy()
    expect(longOperationResult.duration).toBeGreaterThan(14000) // Операция должна была длиться ~15 сек
  })

  test('Память не утекает при повторных операциях', async ({ page }) => {
    await page.goto('chrome-extension://your-extension-id/popup.html')
    
    // Выполняем множество операций для проверки утечек памяти
    for (let i = 0; i < 50; i++) {
      await page.evaluate((index) => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage({
            type: 'SAVE_ARTICLE',
            payload: {
              id: `memory-test-${index}`,
              title: `Memory test ${index}`,
              url: `https://test.com/${index}`,
              description: 'Test description',
              notes: []
            }
          }, resolve)
        })
      }, i)
    }

    // Проверяем, что количество активных операций не растет
    const activeOperations = await page.evaluate(() => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'GET_ACTIVE_OPERATIONS_COUNT'
        }, resolve)
      })
    })

    expect(activeOperations).toBeLessThanOrEqual(5) // Должно быть мало активных операций
  })
})
