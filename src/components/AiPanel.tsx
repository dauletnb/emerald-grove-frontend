import type { AIResult, AIStatus } from '../shared/types'

interface AiPanelProps {
  status: AIStatus
  result?: AIResult
  onRetry?: () => void
}

function SkeletonLine({ width }: { width: string }) {
  return <div className={`h-3 animate-pulse rounded-full bg-slate-200 ${width}`} />
}

function PendingState() {
  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">
        ИИ анализирует эту статью...
      </p>
      <div className="space-y-2.5">
        <SkeletonLine width="w-full" />
        <SkeletonLine width="w-5/6" />
        <SkeletonLine width="w-4/6" />
      </div>
      <div className="space-y-2">
        <SkeletonLine width="w-3/4" />
        <SkeletonLine width="w-2/3" />
        <SkeletonLine width="w-3/5" />
      </div>
    </div>
  )
}

function FailedState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-rose-500">Не удалось выполнить ИИ-анализ этой статьи.</p>
      {onRetry ? (
        <button
          onClick={onRetry}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
        >
          Повторить
        </button>
      ) : null}
    </div>
  )
}

function DoneState({ result }: { result: AIResult }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Краткое содержание</p>
        <p className="text-sm font-semibold leading-6 text-slate-900">{result.summary.short}</p>
        {result.summary.detailed ? (
          <p className="mt-2 text-sm leading-6 text-slate-600">{result.summary.detailed}</p>
        ) : null}
      </div>

      {result.keyPoints.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Ключевые моменты</p>
          <ul className="space-y-1.5">
            {result.keyPoints.map((point, index) => (
              <li key={index} className="flex gap-2 text-sm leading-6 text-slate-700">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.highlights.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Основные выдержки</p>
          <div className="space-y-3">
            {result.highlights.map((highlight, index) => (
              <div key={index} className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3">
                <blockquote className="border-l-2 border-emerald-400 pl-3 text-sm font-medium italic text-slate-800">
                  {highlight.text}
                </blockquote>
                {highlight.explanation ? (
                  <p className="mt-2 text-xs leading-5 text-slate-600">{highlight.explanation}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function AiPanel({ status, result, onRetry }: AiPanelProps) {
  return (
    <div className="rounded-[24px] bg-slate-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">ИИ-выводы</span>
        {status === 'DONE' ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            Готово
          </span>
        ) : status === 'PENDING' ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
            Обработка
          </span>
        ) : (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
            Ошибка
          </span>
        )}
      </div>

      {status === 'PENDING' && <PendingState />}
      {status === 'FAILED' && <FailedState onRetry={onRetry} />}
      {status === 'DONE' && result != null && <DoneState result={result} />}
    </div>
  )
}
