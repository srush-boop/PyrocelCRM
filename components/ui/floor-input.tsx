/**
 * FloorInput — a free-text input with a native <datalist> that suggests
 * common floor / level names from Basement through to 20th.
 *
 * Usage:
 *   <FloorInput id="floor" value={form.floor} onChange={(v) => setForm({ ...form, floor: v })} />
 */
import { useId } from 'react'
import { Input } from '@/components/ui/input'

const FLOOR_SUGGESTIONS = [
  'Basement',
  'Lower Ground',
  'Ground',
  '1st',
  '2nd',
  '3rd',
  '4th',
  '5th',
  '6th',
  '7th',
  '8th',
  '9th',
  '10th',
  '11th',
  '12th',
  '13th',
  '14th',
  '15th',
  '16th',
  '17th',
  '18th',
  '19th',
  '20th',
]

interface FloorInputProps {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function FloorInput({
  id,
  value,
  onChange,
  placeholder = 'e.g. Ground',
  className,
  disabled,
}: FloorInputProps) {
  const generatedId = useId()
  const listId = `floor-suggestions-${generatedId}`

  return (
    <>
      <Input
        id={id}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
        autoComplete="off"
      />
      <datalist id={listId}>
        {FLOOR_SUGGESTIONS.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
    </>
  )
}
