/**
 * Скрипт для мониторинга состояния Service Worker в реальном времени
 * Запускать в DevTools консоли при тестировании
 */
class SWMonitor {
  constructor() {
    this.logs = []
    this.startTime = Date.now()
    this.keepAliveChecks = 0
    this.syncOperations = 0
  }

  /**
   * Начинает мониторинг Service Worker
   */
  startMonitoring() {
    console.log('🔍 Начинаю мониторинг Service Worker...')
    
    // Перехватываем console.log для анализа логов SW
    const originalLog = console.log
    console.log = (...args) => {
      const message = args.join(' ')
      this.logs.push({
        timestamp: Date.now(),
        message: message
      })

      if (message.includes('keep-alive')) {
        this.keepAliveChecks++
      }
      if (message.includes('синхронизацию')) {
        this.syncOperations++
      }

      originalLog.apply(console, args)
    }

    // Проверяем состояние SW каждые 5 секунд
    this.monitoringInterval = setInterval(() => {
      this.checkSWState()
    }, 5000)

    // Проверяем активные операции
    this.operationsInterval = setInterval(() => {
      this.checkActiveOperations()
    }, 10000)
  }

  /**
   * Проверяет состояние Service Worker
   */
  async checkSWState() {
    try {
      // Проверяем, отвечает ли SW
      const response = await chrome.runtime.sendMessage({
        type: 'PING'
      })
      
      if (response && response.status === 'pong') {
        console.log('✅ Service Worker активен')
      } else {
        console.warn('⚠️ Service Worker не отвечает!')
      }
    } catch (error) {
      console.error('❌ Service Worker недоступен:', error)
    }
  }

  /**
   * Проверяет количество активных операций
   */
  async checkActiveOperations() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_ACTIVE_OPERATIONS'
      })
      
      if (response) {
        console.log(`📊 Активные операции: ${response.count}`)
        console.log(`🔄 Keep-alive проверок: ${this.keepAliveChecks}`)
        console.log(`📝 Синхронизаций: ${this.syncOperations}`)
      }
    } catch (error) {
      console.error('Ошибка при проверке операций:', error)
    }
  }

  /**
   * Генерирует отчет о работе SW
   */
  generateReport() {
    const duration = Date.now() - this.startTime
    const report = {
      duration: duration,
      keepAliveChecks: this.keepAliveChecks,
      syncOperations: this.syncOperations,
      totalLogs: this.logs.length,
      logs: this.logs
    }

    console.log('📋 Отчет о работе Service Worker:')
    console.log(`⏱️ Длительность: ${Math.round(duration / 1000)}с`)
    console.log(`🔄 Keep-alive проверок: ${this.keepAliveChecks}`)
    console.log(`📝 Синхронизаций: ${this.syncOperations}`)
    console.log(`📊 Всего логов: ${this.logs.length}`)

    return report
  }

  /**
   * Останавливает мониторинг
   */
  stopMonitoring() {
    clearInterval(this.monitoringInterval)
    clearInterval(this.operationsInterval)
    console.log('🛑 Мониторинг остановлен')
    return this.generateReport()
  }
}

// Глобальный экземпляр для использования в DevTools
window.swMonitor = new SWMonitor()

// Автоматический запуск
console.log(`
🚀 SW Monitor готов к использованию:

// Начать мониторинг:
swMonitor.startMonitoring()

// Остановить и получить отчет:
swMonitor.stopMonitoring()

// Проверить состояние вручную:
swMonitor.checkSWState()
`)
