import { useMemo } from 'react'
import DOMPurify from 'dompurify'

type SafeNoteRendererProps = {
  content: string
  className?: string
  maxLength?: number
  as?: 'div' | 'p' | 'span'
}

const SAFE_TEXT_CONFIG = {
  ALLOWED_TAGS: [],
  ALLOWED_ATTR: [],
  KEEP_CONTENT: true,
}

export function sanitizeTextContent(content: string, maxLength?: number): string {
  if (typeof content !== 'string') {
    return ''
  }

  const normalized = content.trim()
  if (!normalized) {
    return ''
  }

  const truncated =
    maxLength != null && normalized.length > maxLength
      ? `${normalized.slice(0, maxLength)}...`
      : normalized

  return DOMPurify.sanitize(truncated, SAFE_TEXT_CONFIG)
}

export function SafeNoteRenderer({
  content,
  className = '',
  maxLength,
  as = 'div',
}: SafeNoteRendererProps) {
  const safeContent = useMemo(() => sanitizeTextContent(content, maxLength), [content, maxLength])
  const Component = as

  return <Component className={className}>{safeContent || '-'}</Component>
}
