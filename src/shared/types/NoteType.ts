/**
 * Типы заметок - синхронизировано с backend enum NoteType
 * 
 * ВАЖНО: При добавлении нового типа на бэкенде, обязательно добавьте его сюда!
 * Порядок и названия должны точно соответствовать Java enum
 */

// Базовый Union Type для типов заметок
export type NoteTypeCode = 'IDEA' | 'TASK' | 'QUESTION'

// Интерфейс с метаданными для каждого типа
export interface NoteTypeMetadata {
  code: NoteTypeCode
  displayName: string
  description: string
  color: string // Для UI отображения
}

// Объект с метаданными - синхронизирован с Java enum
export const NOTE_TYPES: Record<NoteTypeCode, NoteTypeMetadata> = {
  IDEA: {
    code: 'IDEA',
    displayName: 'Идея',
    description: 'Творческая мысль или концепция',
    color: '#3B82F6' // Синий
  },
  TASK: {
    code: 'TASK',
    displayName: 'Задача',
    description: 'Действие, которое нужно выполнить',
    color: '#10B981' // Зеленый
  },
  QUESTION: {
    code: 'QUESTION',
    displayName: 'Вопрос',
    description: 'Запрос информации или уточнение',
    color: '#F59E0B' // Оранжевый
  }
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

/**
 * Утилита для создания новой заметки с правильным типом
 */
export function createNote<T extends NoteTypeCode>(
  type: T,
  content: string
): {
  id: string
  type: T
  content: string
  createdAt: number
} {
  return {
    id: crypto.randomUUID(),
    type,
    content,
    createdAt: Date.now()
  }
}

/**
 * Тип guards для runtime проверки
 */
export function isIdeaNote(note: { type: NoteTypeCode }): note is { type: 'IDEA' } {
  return note.type === 'IDEA'
}

export function isTaskNote(note: { type: NoteTypeCode }): note is { type: 'TASK' } {
  return note.type === 'TASK'
}

export function isQuestionNote(note: { type: NoteTypeCode }): note is { type: 'QUESTION' } {
  return note.type === 'QUESTION'
}
