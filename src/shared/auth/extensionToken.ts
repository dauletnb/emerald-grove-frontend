export const EXTENSION_TOKEN_STORAGE_KEY = 'extensionToken'

export async function getExtensionToken(): Promise<string | null> {
  const result = await chrome.storage.local.get([EXTENSION_TOKEN_STORAGE_KEY])
  const token = result[EXTENSION_TOKEN_STORAGE_KEY]

  return typeof token === 'string' && token.trim() ? token.trim() : null
}

export async function setExtensionToken(token: string): Promise<void> {
  await chrome.storage.local.set({
    [EXTENSION_TOKEN_STORAGE_KEY]: token.trim(),
  })
}

export async function clearExtensionToken(): Promise<void> {
  await chrome.storage.local.remove(EXTENSION_TOKEN_STORAGE_KEY)
}
