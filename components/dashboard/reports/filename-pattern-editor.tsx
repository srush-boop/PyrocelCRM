'use client'

import { useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  FILENAME_TOKENS,
  buildReportFilename,
  SAMPLE_FILENAME_VARS,
  DEFAULT_FILENAME_PATTERN,
} from '@/lib/reports/pdf-filename'

/**
 * Controlled editor for a report PDF filename convention: a text input, a row of
 * insert-token chips, and a live preview of the resulting filename against
 * sample data. Shared by the company report designer and the per-client dialog.
 */
export function FilenamePatternEditor({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string
  onChange: (next: string) => void
  /** Shown when the field is blank (e.g. the inherited default pattern). */
  placeholder?: string
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function insertToken(token: string) {
    const el = inputRef.current
    const insert = `{${token}}`
    if (!el) {
      onChange(`${value}${insert}`)
      return
    }
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    const next = value.slice(0, start) + insert + value.slice(end)
    onChange(next)
    // Restore caret just after the inserted token.
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + insert.length
      el.setSelectionRange(pos, pos)
    })
  }

  // Preview the effective pattern (fall back to the built-in default when blank).
  const effective = value.trim() || placeholder || DEFAULT_FILENAME_PATTERN
  const preview = buildReportFilename(effective, SAMPLE_FILENAME_VARS)

  return (
    <div className="space-y-2">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || DEFAULT_FILENAME_PATTERN}
        disabled={disabled}
        spellCheck={false}
      />
      <div className="flex flex-wrap gap-1.5">
        {FILENAME_TOKENS.map((t) => (
          <Button
            key={t.token}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={disabled}
            onClick={() => insertToken(t.token)}
            title={t.hint}
          >
            {`{${t.token}}`}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Preview: <span className="font-mono text-foreground">{preview}</span>
      </p>
    </div>
  )
}
