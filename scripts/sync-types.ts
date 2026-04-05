#!/usr/bin/env ts-node

/**
 * Скрипт для автоматической синхронизации типов между Java backend и TypeScript frontend
 * Запускать: npm run sync-types
 */

import * as fs from 'fs'
import * as path from 'path'

// Путь к Java enum файлу
const JAVA_ENUM_PATH = '../Emerald-Grove-Backend/src/main/java/com/emeraldgrove/enums/NoteType.java'
// Путь к TypeScript файлу
const TS_TYPES_PATH = '../Emerald-Grove-Frontend/src/shared/types/NoteType.ts'

interface JavaEnumValue {
  name: string
  code: string
  displayName: string
}

/**
 * Парсит Java enum файл и извлекает значения
 */
function parseJavaEnum(filePath: string): JavaEnumValue[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const enumValues: JavaEnumValue[] = []
  
  // Регулярное выражение для поиска enum значений
  const enumPattern = /(\w+)\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g
  let match
  
  while ((match = enumPattern.exec(content)) !== null) {
    enumValues.push({
      name: match[1],
      code: match[2],
      displayName: match[3]
    })
  }
  
  return enumValues
}

/**
 * Генерирует TypeScript код на основе Java enum
 */
function generateTypeScript(enumValues: JavaEnumValue[]): string {
  const typeCodes = enumValues.map(v => `'${v.code}'`).join(' | ')
  const metadataEntries = enumValues.map(v => `  ${v.code}: {
    code: '${v.code}',
    displayName: '${v.displayName}',
    description: 'Автоматически сгенерировано из Java enum',
    color: '#3B82F6' // TODO: Настроить цвета для каждого типа
  }`).join(',\n')

  return `/**
 * Типы заметок - АВТОМАТИЧЕСКИ СГЕНЕРИРОВАНО из Java enum
 * НЕ РЕДАКТИРОВАТЬ ВРУЧНУЮ! Используйте npm run sync-types
 */

// Базовый Union Type для типов заметок
export type NoteTypeCode = ${typeCodes}

// Интерфейс с метаданными для каждого типа
export interface NoteTypeMetadata {
  code: NoteTypeCode
  displayName: string
  description: string
  color: string // Для UI отображения
}

// Объект с метаданными - синхронизирован с Java enum
export const NOTE_TYPES: Record<NoteTypeCode, NoteTypeMetadata> = {
${metadataEntries}
}

/**
 * Валидатор типов заметок
 */
export function isValidNoteType(code: string): code is NoteTypeCode {
  return Object.keys(NOTE_TYPES).includes(code)
}

/**
 * Получение метаданных типа заметки
 */
export function getNoteTypeMetadata(code: NoteTypeCode): NoteTypeMetadata {
  return NOTE_TYPES[code]
}

/**
 * Получение всех типов заметок
 */
export function getAllNoteTypes(): NoteTypeMetadata[] {
  return Object.values(NOTE_TYPES)
}
`
}

/**
 * Основная функция синхронизации
 */
function syncTypes() {
  try {
    console.log('🔄 Начинаю синхронизацию типов...')
    
    // Проверяем существование Java файла
    if (!fs.existsSync(JAVA_ENUM_PATH)) {
      throw new Error(`Java enum файл не найден: ${JAVA_ENUM_PATH}`)
    }
    
    // Парсим Java enum
    const enumValues = parseJavaEnum(JAVA_ENUM_PATH)
    console.log(`📋 Найдено ${enumValues.length} типов заметок:`, enumValues.map(v => v.name))
    
    // Генерируем TypeScript код
    const tsCode = generateTypeScript(enumValues)
    
    // Записываем в TypeScript файл
    fs.writeFileSync(TS_TYPES_PATH, tsCode, 'utf-8')
    
    console.log('✅ Синхронизация завершена успешно!')
    console.log(`📝 TypeScript файл обновлен: ${TS_TYPES_PATH}`)
    
  } catch (error) {
    console.error('❌ Ошибка при синхронизации типов:', error)
    process.exit(1)
  }
}

// Запускаем синхронизацию
if (require.main === module) {
  syncTypes()
}

export { syncTypes, parseJavaEnum, generateTypeScript }
