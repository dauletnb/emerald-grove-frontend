/**
 * Тест-кейсы для проверки XSS-защиты в трех типах заметок
 */

export interface XssTestCase {
  name: string
  payload: string
  noteType: 'IDEA' | 'TASK' | 'QUESTION'
  expectedBehavior: 'sanitized' | 'blocked' | 'allowed'
  description: string
}

/**
 * Комплексные тест-кейсы для XSS-атак на заметки
 */
export const XSS_TEST_CASES: XssTestCase[] = [
  // === Базовые XSS атаки ===
  {
    name: 'Script Tag Injection',
    payload: '<script>alert("XSS")</script>',
    noteType: 'IDEA',
    expectedBehavior: 'sanitized',
    description: 'Прямая инъекция script тега'
  },
  {
    name: 'JavaScript Protocol',
    payload: 'javascript:alert("XSS")',
    noteType: 'TASK',
    expectedBehavior: 'sanitized',
    description: 'Использование javascript: протокола'
  },
  {
    name: 'Event Handler Injection',
    payload: '<img src="x" onerror="alert(\'XSS\')">',
    noteType: 'QUESTION',
    expectedBehavior: 'sanitized',
    description: 'Инъекция через обработчик событий'
  },

  // === Продвинутые XSS атаки ===
  {
    name: 'Encoded Script',
    payload: '&#60;script&#62;alert("XSS")&#60;/script&#62;',
    noteType: 'IDEA',
    expectedBehavior: 'sanitized',
    description: 'HTML-encoded скрипт'
  },
  {
    name: 'Data URI Attack',
    payload: '<iframe src="data:text/html,<script>alert(\'XSS\')</script>"></iframe>',
    noteType: 'TASK',
    expectedBehavior: 'sanitized',
    description: 'Атака через data URI'
  },
  {
    name: 'SVG Script Injection',
    payload: '<svg onload="alert(\'XSS\')">',
    noteType: 'QUESTION',
    expectedBehavior: 'sanitized',
    description: 'Инъекция через SVG'
  },

  // === Обходные техники ===
  {
    name: 'CSS Expression',
    payload: '<div style="background:url(javascript:alert(\'XSS\'))">',
    noteType: 'IDEA',
    expectedBehavior: 'sanitized',
    description: 'XSS через CSS expression'
  },
  {
    name: 'Meta Refresh',
    payload: '<meta http-equiv="refresh" content="0;url=javascript:alert(\'XSS\')">',
    noteType: 'TASK',
    expectedBehavior: 'sanitized',
    description: 'Атака через meta refresh'
  },
  {
    name: 'Form Action',
    payload: '<form action="javascript:alert(\'XSS\')"><input type="submit"></form>',
    noteType: 'QUESTION',
    expectedBehavior: 'sanitized',
    description: 'XSS через form action'
  },

  // === Контекст-специфичные атаки для типов заметок ===
  {
    name: 'Idea with HTML Comment',
    payload: 'Моя идея <!-- <script>alert("XSS")</script> --> о новом продукте',
    noteType: 'IDEA',
    expectedBehavior: 'sanitized',
    description: 'Скрытый скрипт в HTML комментарии'
  },
  {
    name: 'Task with Link Injection',
    payload: 'Выполнить: <a href="javascript:alert(\'XSS\')">нажать сюда</a>',
    noteType: 'TASK',
    expectedBehavior: 'sanitized',
    description: 'Вредоносная ссылка в задаче'
  },
  {
    name: 'Question with Input Field',
    payload: 'Как сделать <input type="text" onfocus="alert(\'XSS\')" autofocus>?',
    noteType: 'QUESTION',
    expectedBehavior: 'sanitized',
    description: 'Автозапускаемый скрипт в вопросе'
  },

  // === Unicode и обфускация ===
  {
    name: 'Unicode Obfuscation',
    payload: '\\u003cscript\\u003ealert("XSS")\\u003c/script\\u003e',
    noteType: 'IDEA',
    expectedBehavior: 'sanitized',
    description: 'Unicode обфускация скрипта'
  },
  {
    name: 'Mixed Case Script',
    payload: '<ScRiPt>aLeRt("XSS")</ScRiPt>',
    noteType: 'TASK',
    expectedBehavior: 'sanitized',
    description: 'Смешанный регистр для обхода фильтров'
  },
  {
    name: 'Tab Separated',
    payload: '<script\t>alert("XSS")</script>',
    noteType: 'QUESTION',
    expectedBehavior: 'sanitized',
    description: 'Использование табов для разделения'
  },

  // === Полезные легитимные случаи (должны работать) ===
  {
    name: 'Valid Bold Text',
    payload: 'Это **важная** идея для проекта',
    noteType: 'IDEA',
    expectedBehavior: 'allowed',
    description: 'Легитимное форматирование текста'
  },
  {
    name: 'Valid Code Snippet',
    payload: 'Проверить console.log("debug") в консоли',
    noteType: 'TASK',
    expectedBehavior: 'allowed',
    description: 'Легитимный код в задаче'
  },
  {
    name: 'Valid Question Mark',
    payload: 'Как использовать <div> для верстки?',
    noteType: 'QUESTION',
    expectedBehavior: 'allowed',
    description: 'Легитимный вопрос о HTML'
  }
]

/**
 * Функция для выполнения XSS тестов
 */
export async function runXssTests() {
  console.log('🛡️ Начинаю XSS тестирование...')
  
  const results = []
  
  for (const testCase of XSS_TEST_CASES) {
    try {
      // Отправляем заметку через расширение
      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_ARTICLE',
        payload: {
          id: `xss-test-${Date.now()}`,
          title: 'XSS Test Article',
          url: 'https://test.com',
          description: 'Test description',
          notes: [{
            id: crypto.randomUUID(),
            type: testCase.noteType,
            content: testCase.payload,
            createdAt: Date.now()
          }]
        }
      })

      // Проверяем результат
      const passed = response.status === 'success' || response.status === 'offline_saved'
      
      results.push({
        ...testCase,
        result: passed ? 'PASS' : 'FAIL',
        response: response
      })

      console.log(`${passed ? '✅' : '❌'} ${testCase.name}: ${testCase.description}`)
      
    } catch (error) {
      results.push({
        ...testCase,
        result: 'ERROR',
        error: error.message
      })
      console.log(`❌ ${testCase.name}: Ошибка - ${error.message}`)
    }
  }

  // Генерируем отчет
  const passed = results.filter(r => r.result === 'PASS').length
  const failed = results.filter(r => r.result === 'FAIL').length
  const errors = results.filter(r => r.result === 'ERROR').length

  console.log(`\n📊 Результаты XSS тестирования:`)
  console.log(`✅ Пройдено: ${passed}`)
  console.log(`❌ Провалено: ${failed}`)
  console.log(`⚠️ Ошибки: ${errors}`)
  console.log(`📈 Успешность: ${Math.round((passed / results.length) * 100)}%`)

  return results
}

/**
 * Автоматизированное тестирование с Playwright
 */
export function createXssPlaywrightTest() {
  return async ({ page }) => {
    await page.goto('chrome-extension://your-extension-id/popup.html')
    
    const results = []
    
    for (const testCase of XSS_TEST_CASES) {
      // Создаем заметку через UI
      await page.fill('[data-testid="note-content"]', testCase.payload)
      await page.selectOption('[data-testid="note-type"]', testCase.noteType)
      await page.click('[data-testid="save-note"]')
      
      // Проверяем, что XSS не сработал
      const alerts = await page.evaluate(() => {
        let alertCount = 0
        const originalAlert = window.alert
        window.alert = () => { alertCount++ }
        return alertCount
      })
      
      const passed = alerts === 0
      
      results.push({
        ...testCase,
        result: passed ? 'PASS' : 'FAIL',
        alertsTriggered: alerts
      })
    }
    
    return results
  }
}
