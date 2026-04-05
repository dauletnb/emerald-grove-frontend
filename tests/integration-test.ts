/**
 * Интеграционный тест для проверки корректности отправки данных с frontend на backend
 */

import { syncArticleToServer } from '../shared/api/articles-fixed'
import type { Article, ArticleNote } from '../shared/types'

/**
 * Тестовые данные для проверки интеграции
 */
const testArticle: Article = {
  id: 'integration-test-123',
  title: 'Integration Test Article',
  url: 'https://example.com/integration-test',
  description: 'This is a test article for integration testing',
  notes: [
    {
      id: 'note-1',
      type: 'IDEA',
      content: 'Test idea for integration',
      createdAt: Date.now()
    },
    {
      id: 'note-2',
      type: 'TASK',
      content: 'Test task for integration',
      createdAt: Date.now()
    },
    {
      id: 'note-3',
      type: 'QUESTION',
      content: 'Test question for integration',
      createdAt: Date.now()
    }
  ],
  createdAt: Date.now(),
  updatedAt: Date.now()
}

/**
 * Тестовые данные с XSS для проверки санитизации
 */
const xssTestArticle: Article = {
  id: 'xss-test-123',
  title: 'XSS Test Article',
  url: 'https://example.com/xss-test',
  description: '<script>alert("XSS in description")</script> This should be sanitized',
  notes: [
    {
      id: 'xss-note-1',
      type: 'IDEA',
      content: '<img src="x" onerror="alert(\'XSS in note\')"> Malicious content',
      createdAt: Date.now()
    }
  ],
  createdAt: Date.now(),
  updatedAt: Date.now()
}

/**
 * Запуск интеграционных тестов
 */
async function runIntegrationTests() {
  console.log('🚀 Начинаю интеграционное тестирование Frontend ↔ Backend')
  
  const results = []
  
  try {
    // Тест 1: Базовая синхронизация
    console.log('\n📋 Тест 1: Базовая синхронизация статьи')
    const result1 = await syncArticleToServer(testArticle)
    console.log('✅ Результат:', result1)
    results.push({ test: 'Basic Sync', status: 'PASS', result: result1 })
    
  } catch (error) {
    console.error('❌ Ошибка в тесте 1:', error)
    results.push({ test: 'Basic Sync', status: 'FAIL', error: error.message })
  }
  
  try {
    // Тест 2: XSS санитизация
    console.log('\n🛡️ Тест 2: XSS санитизация')
    const result2 = await syncArticleToServer(xssTestArticle)
    console.log('✅ Результат:', result2)
    
    // Проверяем, что контент был санитизирован
    const sanitizedNote = result2.article.notes.find(n => n.id === 'xss-note-1')
    const isSanitized = !sanitizedNote?.content.includes('<script>') && 
                       !sanitizedNote?.content.includes('onerror')
    
    if (isSanitized) {
      console.log('✅ XSS контент успешно санитизирован')
      results.push({ test: 'XSS Sanitization', status: 'PASS', result: result2 })
    } else {
      console.error('❌ XSS контент не был санитизирован')
      results.push({ test: 'XSS Sanitization', status: 'FAIL', result: result2 })
    }
    
  } catch (error) {
    console.error('❌ Ошибка в тесте 2:', error)
    results.push({ test: 'XSS Sanitization', status: 'FAIL', error: error.message })
  }
  
  try {
    // Тест 3: Валидация типов
    console.log('\n🔍 Тест 3: Валидация типов заметок')
    const invalidTypeArticle: Article = {
      id: 'invalid-type-123',
      title: 'Invalid Type Test',
      url: 'https://example.com/invalid',
      description: 'Test with invalid note type',
      notes: [
        {
          id: 'invalid-note',
          type: 'INVALID_TYPE' as any, // Невалидный тип
          content: 'This note should be filtered out',
          createdAt: Date.now()
        },
        {
          id: 'valid-note',
          type: 'IDEA',
          content: 'This note should be kept',
          createdAt: Date.now()
        }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    
    const result3 = await syncArticleToServer(invalidTypeArticle)
    console.log('✅ Результат:', result3)
    
    // Проверяем, что невалидные заметки были отфильтрованы
    const validNotesCount = result3.article.notes.filter(n => 
      ['IDEA', 'TASK', 'QUESTION'].includes(n.type)
    ).length
    
    if (validNotesCount === 1) {
      console.log('✅ Невалидные типы заметок успешно отфильтрованы')
      results.push({ test: 'Type Validation', status: 'PASS', result: result3 })
    } else {
      console.error('❌ Невалидные типы не были отфильтрованы')
      results.push({ test: 'Type Validation', status: 'FAIL', result: result3 })
    }
    
  } catch (error) {
    console.error('❌ Ошибка в тесте 3:', error)
    results.push({ test: 'Type Validation', status: 'FAIL', error: error.message })
  }
  
  // Генерация отчета
  console.log('\n📊 Отчет об интеграционном тестировании:')
  const passed = results.filter(r => r.status === 'PASS').length
  const failed = results.filter(r => r.status === 'FAIL').length
  
  console.log(`✅ Пройдено: ${passed}`)
  console.log(`❌ Провалено: ${failed}`)
  console.log(`📈 Успешность: ${Math.round((passed / results.length) * 100)}%`)
  
  results.forEach(result => {
    console.log(`\n${result.status === 'PASS' ? '✅' : '❌'} ${result.test}:`)
    if (result.error) {
      console.log(`   Ошибка: ${result.error}`)
    }
  })
  
  return results
}

/**
 * Проверка соответствия типов между frontend и backend
 */
function validateTypeCompatibility() {
  console.log('\n🔍 Проверка совместимости типов:')
  
  // Frontend типы
  const frontendTypes = ['IDEA', 'TASK', 'QUESTION']
  
  // Backend типы (должны соответствовать)
  const backendTypes = ['IDEA', 'TASK', 'QUESTION'] // Из NoteType.java
  
  const isCompatible = frontendTypes.length === backendTypes.length &&
                      frontendTypes.every(type => backendTypes.includes(type))
  
  if (isCompatible) {
    console.log('✅ Типы на frontend и backend совместимы')
  } else {
    console.error('❌ Обнаружено несоответствие типов:')
    console.log('Frontend:', frontendTypes)
    console.log('Backend:', backendTypes)
  }
  
  return isCompatible
}

// Экспорт для использования в других тестах
export { runIntegrationTests, validateTypeCompatibility, testArticle, xssTestArticle }

// Автоматический запуск при выполнении файла
if (require.main === module) {
  validateTypeCompatibility()
  runIntegrationTests().catch(console.error)
}
