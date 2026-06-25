'use client'

import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ChevronDown, FileDown, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { fetchQuoteSections } from '@/app/(dashboard)/dashboard/sales/quote-config-actions'
import type {
  AssetType,
  QuoteDesignCategory,
  QuoteSection,
  QuoteSectionElement,
  QuoteTableColumn,
  SystemSpecTemplate,
} from '@/lib/types/database'

type Values = Record<string, string | number | boolean>
type TableRow = Record<string, string>

// Extra data the asset_type and spec_template elements need to render. Threaded
// down from the system being edited so these elements behave like the old
// hardcoded Step 3 / PPM asset pickers.
type RenderContext = {
  // Asset types belonging to this system's system type.
  assetTypes: AssetType[]
  // The system's current specification text and a setter (spec_template writes here).
  specification: string
  onSpecChange: (value: string) => void
  // Spec template matching this system type + work type, if any.
  matchingTemplate?: SystemSpecTemplate
  // Design categories + the system's current selection (design_category writes here).
  designCategories: QuoteDesignCategory[]
  designCategoryId: string | null
  onDesignCategoryChange: (id: string) => void
}

// Parse a table element's stored JSON-string value back into rows.
function parseRows(value: string | number | boolean | undefined): TableRow[] {
  if (typeof value !== 'string' || !value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as TableRow[]) : []
  } catch {
    return []
  }
}

/**
 * Renders the admin-configured sections for a system's system type x work type.
 * Answers are stored in the system's conditional_values, keyed by element_key.
 * Returns null (renders nothing) when no sections are configured, so the caller
 * can fall back to its default fields.
 */
export function QuoteSectionRenderer({
  systemTypeId,
  workType,
  values,
  onChange,
  disabled,
  onLoaded,
  assetTypes,
  specification,
  onSpecChange,
  matchingTemplate,
  designCategories,
  designCategoryId,
  onDesignCategoryChange,
}: {
  systemTypeId: string
  workType: string
  values: Values
  onChange: (key: string, value: string | number | boolean) => void
  disabled?: boolean
  // Notifies the parent whether any sections exist (to hide default fallbacks).
  onLoaded?: (hasSections: boolean) => void
  assetTypes: AssetType[]
  specification: string
  onSpecChange: (value: string) => void
  matchingTemplate?: SystemSpecTemplate
  designCategories: QuoteDesignCategory[]
  designCategoryId: string | null
  onDesignCategoryChange: (id: string) => void
}) {
  const [sections, setSections] = useState<QuoteSection[] | null>(null)

  const ctx: RenderContext = {
    assetTypes,
    specification,
    onSpecChange,
    matchingTemplate,
    designCategories,
    designCategoryId,
    onDesignCategoryChange,
  }

  useEffect(() => {
    if (!systemTypeId || !workType) {
      setSections([])
      onLoaded?.(false)
      return
    }
    let cancelled = false
    fetchQuoteSections(systemTypeId, workType).then((data) => {
      if (!cancelled) {
        setSections(data)
        onLoaded?.(data.length > 0)
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemTypeId, workType])

  if (!sections || sections.length === 0) return null

  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <SectionBlock
          key={section.id}
          section={section}
          values={values}
          onChange={onChange}
          disabled={disabled}
          ctx={ctx}
        />
      ))}
    </div>
  )
}

function SectionBlock({
  section,
  values,
  onChange,
  disabled,
  ctx,
}: {
  section: QuoteSection
  values: Values
  onChange: (key: string, value: string | number | boolean) => void
  disabled?: boolean
  ctx: RenderContext
}) {
  const [open, setOpen] = useState(!section.default_collapsed)

  // Conditional display: only show when the referenced element equals the value.
  const visible = useMemo(() => {
    if (!section.condition_element_key) return true
    const current = values[section.condition_element_key]
    return String(current ?? '') === String(section.condition_value ?? '')
  }, [section.condition_element_key, section.condition_value, values])

  if (!visible) return null

  const elements = section.elements ?? []

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-md border bg-muted/20"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {section.title}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-3 px-3 pb-3 sm:grid-cols-2">
          {elements.length === 0 ? (
            <p className="text-sm text-muted-foreground sm:col-span-2">No fields in this section.</p>
          ) : (
            elements.map((el) => (
              <ElementField
                key={el.id}
                element={el}
                value={values[el.element_key]}
                onChange={(v) => onChange(el.element_key, v)}
                disabled={disabled}
                ctx={ctx}
              />
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function ElementField({
  element,
  value,
  onChange,
  disabled,
  ctx,
}: {
  element: QuoteSectionElement
  value: string | number | boolean | undefined
  onChange: (value: string | number | boolean) => void
  disabled?: boolean
  ctx: RenderContext
}) {
  const fullWidth =
    element.element_type === 'paragraph' ||
    element.element_type === 'table' ||
    element.element_type === 'spec_template'

  // The spec_template element renders its own label + import button inline.
  if (element.element_type === 'spec_template') {
    return (
      <div className="grid gap-1.5 sm:col-span-2">
        {renderControl(element, value, onChange, ctx, disabled)}
      </div>
    )
  }

  return (
    <div className={cn('grid gap-1.5', fullWidth && 'sm:col-span-2')}>
      <Label className="text-sm">
        {element.label}
        {element.required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {renderControl(element, value, onChange, ctx, disabled)}
    </div>
  )
}

function renderControl(
  element: QuoteSectionElement,
  value: string | number | boolean | undefined,
  onChange: (value: string | number | boolean) => void,
  ctx: RenderContext,
  disabled?: boolean,
) {
  switch (element.element_type) {
    case 'asset_type':
      return (
        <Select
          value={String(value ?? '')}
          onValueChange={(v) => onChange(v)}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select asset type" />
          </SelectTrigger>
          <SelectContent>
            {ctx.assetTypes.length === 0 ? (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                No asset types for this system type
              </div>
            ) : (
              ctx.assetTypes.map((a) => (
                <SelectItem key={a.id} value={a.name}>
                  {a.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      )
    case 'design_category':
      return (
        <Select
          value={ctx.designCategoryId ?? ''}
          onValueChange={(v) => ctx.onDesignCategoryChange(v)}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select design category" />
          </SelectTrigger>
          <SelectContent>
            {ctx.designCategories.length === 0 ? (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                No design categories configured
              </div>
            ) : (
              ctx.designCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      )
    case 'spec_template':
      return (
        <>
          <div className="flex items-center justify-between">
            <Label className="text-sm">
              {element.label}
              {element.required && <span className="ml-0.5 text-destructive">*</span>}
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={disabled || !ctx.matchingTemplate?.specification}
              onClick={() => {
                if (ctx.matchingTemplate?.specification) {
                  ctx.onSpecChange(ctx.matchingTemplate.specification)
                  toast.success('Specification imported from template')
                } else {
                  toast.error('No template for this system + work type yet')
                }
              }}
            >
              <FileDown className="mr-1.5 h-3.5 w-3.5" />
              Import from template
            </Button>
          </div>
          <Textarea
            value={ctx.specification}
            onChange={(e) => ctx.onSpecChange(e.target.value)}
            rows={4}
            placeholder="The specification for this system. Import a master template, then edit."
            disabled={disabled}
          />
        </>
      )
    case 'paragraph':
      return (
        <Textarea
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          disabled={disabled}
        />
      )
    case 'select':
      return (
        <Select
          value={String(value ?? '')}
          onValueChange={(v) => onChange(v)}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            {(element.options as string[]).map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    case 'yesno':
      return (
        <Select
          value={String(value ?? '')}
          onValueChange={(v) => onChange(v)}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="yes">Yes</SelectItem>
            <SelectItem value="no">No</SelectItem>
            <SelectItem value="na">N/A (omit from quote)</SelectItem>
          </SelectContent>
        </Select>
      )
    case 'number':
      return (
        <Input
          type="number"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      )
    case 'price':
      return (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">£</span>
          <Input
            inputMode="decimal"
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
        </div>
      )
    case 'table':
      return (
        <TableControl
          columns={element.options as QuoteTableColumn[]}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      )
    case 'text':
    default:
      return (
        <Input
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      )
  }
}

// Editable table: rows stored as a JSON string in conditional_values so the
// existing string|number|boolean value type is preserved.
function TableControl({
  columns,
  value,
  onChange,
  disabled,
}: {
  columns: QuoteTableColumn[]
  value: string | number | boolean | undefined
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const rows = parseRows(value)

  function commit(next: TableRow[]) {
    onChange(JSON.stringify(next))
  }

  function updateCell(rowIndex: number, colKey: string, cell: string) {
    const next = rows.map((r, i) => (i === rowIndex ? { ...r, [colKey]: cell } : r))
    commit(next)
  }

  function addRow() {
    const blank: TableRow = {}
    for (const c of columns) blank[c.key] = ''
    commit([...rows, blank])
  }

  function removeRow(rowIndex: number) {
    commit(rows.filter((_, i) => i !== rowIndex))
  }

  return (
    <div className="overflow-x-auto rounded-md border bg-background">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            {columns.map((c) => (
              <th key={c.key} className="px-2 py-1.5 text-left font-medium">
                {c.label}
              </th>
            ))}
            <th className="w-10 px-2 py-1.5" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + 1}
                className="px-2 py-3 text-center text-muted-foreground"
              >
                No rows yet.
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b last:border-0">
                {columns.map((c) => (
                  <td key={c.key} className="px-1 py-1">
                    <Input
                      value={row[c.key] ?? ''}
                      onChange={(e) => updateCell(rowIndex, c.key, e.target.value)}
                      className="h-8"
                      disabled={disabled}
                    />
                  </td>
                ))}
                <td className="px-1 py-1 text-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => removeRow(rowIndex)}
                    disabled={disabled}
                    aria-label="Remove row"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="p-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
          disabled={disabled}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add row
        </Button>
      </div>
    </div>
  )
}
