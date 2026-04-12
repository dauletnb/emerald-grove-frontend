/**
 * Authentication API layer.
 *
 * How auth works (beginner explanation):
 * 1. User registers or logs in — backend returns two tokens:
 *    - accessToken: a short-lived JWT (15 min) that proves identity on every request
 *    - refreshToken: a long-lived random string (7 days) stored in the database, used to get new access tokens
 * 2. The extension stores both tokens in chrome.storage.local
 * 3. Every API request attaches the access token in the Authorization header
 * 4. When the access token expires (401 response), the frontend calls /api/auth/refresh with the refresh token
 * 5. Logout revokes the refresh token so it can no longer be used
 */

import { API_BASE_URL } from '@/config'
import { clearAuthSession, getAuthSession, setAuthSession, type AuthSession } from '../auth/authSession'

export class ApiAuthError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiAuthError'
    this.status = status
  }
}

type AuthApiResponse = {
  accessToken: string
  refreshToken: string
  user: {
    id: number
    email: string
    displayName: string
  }
}

type CurrentUserResponse = {
  id: number
  email: string
  displayName: string
}

let refreshSessionPromise: Promise<AuthSession | null> | null = null

export async function loginUser(email: string, password: string): Promise<AuthSession> {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    const message = tryParseErrorMessage(errorText) ?? 'Invalid email or password.'
    throw new ApiAuthError(message, response.status)
  }

  const data = (await response.json()) as AuthApiResponse
  const session: AuthSession = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user: data.user,
  }
  await setAuthSession(session)
  return session
}

export async function registerUser(email: string, password: string, displayName?: string): Promise<AuthSession> {
  const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    const message = tryParseErrorMessage(errorText) ?? 'Registration failed.'
    throw new ApiAuthError(message, response.status)
  }

  const data = (await response.json()) as AuthApiResponse
  const session: AuthSession = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user: data.user,
  }
  await setAuthSession(session)
  return session
}

export async function logoutUser(): Promise<void> {
  const session = await getAuthSession()
  if (session) {
    // Best-effort: tell the server to revoke the refresh token
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    }).catch(() => {
      // Ignore server errors on logout — local session is cleared regardless
    })
  }
  await clearAuthSession()
}

export async function restoreAuthSession(): Promise<AuthSession | null> {
  const session = await getAuthSession()

  if (!session) {
    return null
  }

  try {
    const user = await fetchCurrentUser(session.accessToken)
    const restoredSession = { ...session, user }
    await setAuthSession(restoredSession)
    return restoredSession
  } catch (error) {
    if (!(error instanceof ApiAuthError) || (error.status !== 401 && error.status !== 403)) {
      return session
    }
  }

  const refreshedSession = await tryRefreshSession()

  if (!refreshedSession) {
    return null
  }

  try {
    const user = await fetchCurrentUser(refreshedSession.accessToken)
    const restoredSession = { ...refreshedSession, user }
    await setAuthSession(restoredSession)
    return restoredSession
  } catch {
    await clearAuthSession()
    return null
  }
}

/**
 * Tries to refresh the access token using the stored refresh token.
 * Returns the new session, or null if the refresh token is expired/invalid.
 */
export async function tryRefreshSession(): Promise<AuthSession | null> {
  if (refreshSessionPromise) {
    return refreshSessionPromise
  }

  refreshSessionPromise = performRefreshSession()

  try {
    return await refreshSessionPromise
  } finally {
    refreshSessionPromise = null
  }
}

async function performRefreshSession(): Promise<AuthSession | null> {
  const session = await getAuthSession()
  if (!session) return null

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    })

    if (!response.ok) {
      await clearAuthSession()
      return null
    }

    const data = (await response.json()) as AuthApiResponse
    const newSession: AuthSession = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
    }
    await setAuthSession(newSession)
    return newSession
  } catch {
    await clearAuthSession()
    return null
  }
}

async function fetchCurrentUser(accessToken: string): Promise<AuthSession['user']> {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new ApiAuthError('Failed to restore the current session.', response.status)
  }

  return (await response.json()) as CurrentUserResponse
}

function tryParseErrorMessage(text: string): string | null {
  try {
    const json = JSON.parse(text) as Record<string, unknown>
    if (typeof json.message === 'string') return json.message
    if (typeof json.error === 'string') return json.error
  } catch {
    // not JSON
  }
  return null
}
