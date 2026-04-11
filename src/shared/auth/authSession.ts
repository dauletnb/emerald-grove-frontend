/**
 * Stores the user's auth session (tokens + user info) in the browser extension's local storage.
 *
 * Why extension storage instead of localStorage?
 * - chrome.storage.local persists across pages and is accessible from all extension contexts
 *   (popup, background, content scripts)
 * - Regular localStorage is scoped to a single page and inaccessible from background scripts
 */

export type AuthUser = {
  id: number
  email: string
  displayName: string
}

export type AuthSession = {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

const SESSION_KEY = 'authSession'

export async function getAuthSession(): Promise<AuthSession | null> {
  const result = await chrome.storage.local.get([SESSION_KEY])
  const session = result[SESSION_KEY]
  return session != null && typeof session === 'object' ? (session as AuthSession) : null
}

export async function setAuthSession(session: AuthSession): Promise<void> {
  await chrome.storage.local.set({ [SESSION_KEY]: session })
}

export async function clearAuthSession(): Promise<void> {
  await chrome.storage.local.remove(SESSION_KEY)
}
