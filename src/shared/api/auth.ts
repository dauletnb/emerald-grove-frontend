import { API_BASE_URL } from '@/config'

export class ApiAuthError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiAuthError'
    this.status = status
  }
}

function createAuthHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token.trim()}`,
  }
}

export async function verifyServerToken(token: string): Promise<void> {
  const normalizedToken = token.trim()

  if (!normalizedToken) {
    throw new ApiAuthError('Введите токен подключения к серверу.', 401)
  }

  const response = await fetch(`${API_BASE_URL}/api/auth/check`, {
    method: 'GET',
    headers: createAuthHeaders(normalizedToken),
  })

  if (response.ok) {
    return
  }

  if (response.status === 401) {
    throw new ApiAuthError('Сервер отклонил токен. Проверьте значение и попробуйте снова.', 401)
  }

  if (response.status === 403) {
    throw new ApiAuthError('Сервер отклонил запрос расширения. Проверьте CORS-настройки backend.', 403)
  }

  throw new ApiAuthError(`Проверка токена завершилась ошибкой сервера (${response.status}).`, response.status)
}
