'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Loader2,
  ImagePlus,
  Eye,
  GripVertical,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ServiceReport } from '@/components/dashboard/reports/service-report'
import {
  BLOCK_META,
  DATA_BLOCK_TYPES,
  CUSTOM_BLOCK_TYPES,
  REPORT_TEXT_VARIABLES,
  DEFAULT_SERVICE_LAYOUT,
  createReportBlock,
} from '@/lib/reports/layout'
import {
  saveReportTemplate,
  resetReportTemplate,
} from '@/lib/actions/report-templates'
import { saveFilenamePattern } from '@/lib/actions/report-filename-patterns'
import { FilenamePatternEditor } from '@/components/dashboard/reports/filename-pattern-editor'
import { DEFAULT_FILENAME_PATTERN } from '@/lib/reports/pdf-filename'
import type {
  ReportBlock,
  ReportBlockType,
  ReportTemplate,
  ReportFilenamePattern,
  TaskWithDetails,
  TaskResult,
} from '@/lib/types/database'

interface ReportServiceType {
  id: string
  name: string
  color: string | null
}

interface ReportTemplatesSettingsProps {
  serviceTypes: ReportServiceType[]
  templates: ReportTemplate[]
  filenamePatterns: ReportFilenamePattern[]
}

const DEFAULT_TARGET = 'default'

interface DraftSections {
  company_address: string
  company_phone: string
  company_email: string
  signatory_name: string
  signatory_title: string
  standards: string
}

interface Draft {
  name: string
  companyName: string
  logoUrl: string
  headerColor: string
  footerText: string
  includeSignature: boolean
  sections: DraftSections
  // Whether this target pins its own layout. When false the target inherits the
  // layout (company default → built-in) and `layout` is not persisted.
  customLayout: boolean
  layout: ReportBlock[]
}

function cloneDefaultLayout(): ReportBlock[] {
  return DEFAULT_SERVICE_LAYOUT.map((b) => ({ ...b, props: b.props ? { ...b.props } : undefined }))
}

function buildDraft(template: ReportTemplate | null): Draft {
  const s = template?.sections ?? {}
  return {
    name: template?.name ?? '',
    companyName: template?.company_name ?? '',
    logoUrl: template?.logo_url ?? '',
    headerColor: template?.header_color ?? '',
    footerText: template?.footer_text ?? '',
    includeSignature: template?.include_signature ?? true,
    sections: {
      company_address: (s.company_address as string) ?? '',
      company_phone: (s.company_phone as string) ?? '',
      company_email: (s.company_email as string) ?? '',
      signatory_name: (s.signatory_name as string) ?? '',
      signatory_title: (s.signatory_title as string) ?? '',
      standards: (s.standards as string) ?? '',
    },
    customLayout: Array.isArray(template?.layout),
    layout: template?.layout ?? cloneDefaultLayout(),
  }
}

export function ReportTemplatesSettings({
  serviceTypes,
  templates,
  filenamePatterns,
}: ReportTemplatesSettingsProps) {
  const router = useRouter()
  const [target, setTarget] = useState<string>(DEFAULT_TARGET)
  const templateFor = (t: string): ReportTemplate | null =>
    t === DEFAULT_TARGET
      ? (templates.find((r) => r.service_type_id === null) ?? null)
      : (templates.find((r) => r.service_type_id === t) ?? null)

  // Company-scope (client_id NULL) filename pattern for a given target.
  const filenameFor = (t: string): string =>
    filenamePatterns.find(
      (p) =>
        (p.client_id ?? null) === null &&
        (p.service_type_id ?? null) === (t === DEFAULT_TARGET ? null : t),
    )?.pattern ?? ''
  // The company default pattern shown as the inherited placeholder for services.
  const companyDefaultPattern = filenameFor(DEFAULT_TARGET) || DEFAULT_FILENAME_PATTERN

  const [draft, setDraft] = useState<Draft>(() => buildDraft(templateFor(DEFAULT_TARGET)))
  const [filenameDraft, setFilenameDraft] = useState<string>(() => filenameFor(DEFAULT_TARGET))
  const [savingFilename, setSavingFilename] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const selectTarget = (t: string) => {
    setTarget(t)
    setDraft(buildDraft(templateFor(t)))
    setFilenameDraft(filenameFor(t))
    setMessage(null)
  }

  async function handleSaveFilename(patternOverride?: string) {
    const pattern = patternOverride ?? filenameDraft
    setSavingFilename(true)
    setMessage(null)
    const result = await saveFilenamePattern({
      clientId: null,
      serviceTypeId: target === DEFAULT_TARGET ? null : target,
      pattern,
    })
    setSavingFilename(false)
    if (result.ok) {
      setMessage({ type: 'success', text: 'PDF file name saved.' })
      router.refresh()
    } else {
      setMessage({ type: 'error', text: result.error ?? 'Failed to save file name.' })
    }
  }

  const hasRow = !!templateFor(target)
  const selectedServiceType =
    target === DEFAULT_TARGET ? null : serviceTypes.find((s) => s.id === target) ?? null

  function patch(partial: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...partial }))
  }
  function patchSection(partial: Partial<DraftSections>) {
    setDraft((d) => ({ ...d, sections: { ...d.sections, ...partial } }))
  }

  // ---- Layout block helpers -------------------------------------------------
  function updateBlock(id: string, partial: Partial<ReportBlock>) {
    setDraft((d) => ({
      ...d,
      layout: d.layout.map((b) => (b.id === id ? { ...b, ...partial } : b)),
    }))
  }
  function updateBlockProps(id: string, props: Record<string, unknown>) {
    setDraft((d) => ({
      ...d,
      layout: d.layout.map((b) =>
        b.id === id ? { ...b, props: { ...(b.props ?? {}), ...props } } : b,
      ),
    }))
  }
  function moveBlock(index: number, dir: -1 | 1) {
    setDraft((d) => {
      const next = [...d.layout]
      const j = index + dir
      if (j < 0 || j >= next.length) return d
      ;[next[index], next[j]] = [next[j], next[index]]
      return { ...d, layout: next }
    })
  }
  function removeBlock(id: string) {
    setDraft((d) => ({ ...d, layout: d.layout.filter((b) => b.id !== id) }))
  }
  function addBlock(type: ReportBlockType) {
    setDraft((d) => ({ ...d, layout: [...d.layout, createReportBlock(type)] }))
  }

  const presentTypes = useMemo(() => new Set(draft.layout.map((b) => b.type)), [draft.layout])
  const addableData = DATA_BLOCK_TYPES.filter((t) => !presentTypes.has(t))

  // ---- Image upload ---------------------------------------------------------
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingBlockId, setUploadingBlockId] = useState<string | null>(null)

  async function uploadImage(file: File): Promise<string | null> {
    const body = new FormData()
    body.append('file', file)
    const res = await fetch('/api/report-templates/image/upload', { method: 'POST', body })
    if (!res.ok) {
      setMessage({ type: 'error', text: 'Image upload failed.' })
      return null
    }
    const data = (await res.json()) as { url?: string }
    return data.url ?? null
  }

  // ---- Save / reset ---------------------------------------------------------
  async function handleSave() {
    setSaving(true)
    setMessage(null)
    const result = await saveReportTemplate({
      serviceTypeId: target === DEFAULT_TARGET ? null : target,
      name: draft.name || (selectedServiceType?.name ?? 'Company default'),
      companyName: draft.companyName,
      logoUrl: draft.logoUrl,
      headerColor: draft.headerColor,
      footerText: draft.footerText,
      includeSignature: draft.includeSignature,
      sections: draft.sections as unknown as Record<string, unknown>,
      layout: draft.customLayout ? draft.layout : null,
    })
    setSaving(false)
    if (result.ok) {
      setMessage({ type: 'success', text: 'Report design saved.' })
      router.refresh()
    } else {
      setMessage({ type: 'error', text: result.error ?? 'Failed to save.' })
    }
  }

  async function handleReset() {
    if (!hasRow) return
    setSaving(true)
    setMessage(null)
    const result = await resetReportTemplate(target === DEFAULT_TARGET ? null : target)
    setSaving(false)
    if (result.ok) {
      setDraft(buildDraft(null))
      setMessage({ type: 'success', text: 'Reset to inherit the default.' })
      router.refresh()
    } else {
      setMessage({ type: 'error', text: result.error ?? 'Failed to reset.' })
    }
  }

  // ---- Live preview data ----------------------------------------------------
  const previewTemplate = useMemo<ReportTemplate>(
    () => ({
      id: 'preview',
      service_type_id: target === DEFAULT_TARGET ? null : target,
      name: draft.name,
      company_name: draft.companyName || null,
      logo_url: draft.logoUrl || null,
      header_color: draft.headerColor || null,
      footer_text: draft.footerText || null,
      include_signature: draft.includeSignature,
      sections: draft.sections as unknown as Record<string, unknown>,
      layout: draft.customLayout ? draft.layout : null,
    }),
    [draft, target],
  )

  const sampleServiceName = selectedServiceType?.name ?? 'Fire Alarm'
  const today = new Date().toISOString()
  const sampleTask = useMemo(
    () =>
      ({
        id: 'preview',
        status: 'completed',
        scheduled_date: today,
        completed_at: today,
        reference_number: 'PYR-2026-000123',
        completed_engineer_name: 'Alex Turner',
        site_service: {
          site: {
            id: 'preview',
            name: 'Sample Site',
            address: '1 Example Street, Leeds, LS1 1AA',
            client: { name: 'Sample Client Ltd' },
          },
          service_type: { name: sampleServiceName, color: draft.headerColor || null },
        },
        assigned_engineer: {
          full_name: 'Alex Turner',
          role_ref: { name: 'Fire Engineer' },
          signature_url: null,
        },
        visit_type: { name: 'Annual' },
      }) as unknown as TaskWithDetails,
    [sampleServiceName, draft.headerColor, today],
  )
  const sampleResult = useMemo(
    () =>
      ({
        overall_status: 'pass',
        reference_number: 'PYR-2026-000123',
        checklist_results: [
          { item_id: '1', label: 'Control panel operational', type: 'pass_fail', passed: true },
          { item_id: '2', label: 'Manual call points tested', type: 'pass_fail', passed: true },
          { item_id: '3', label: 'Sounder levels within tolerance', type: 'pass_fail', passed: false },
        ],
        engineer_notes:
          'All devices tested in line with BS 5839-1. One sounder measured below the required level; a remedial quote will follow.',
        photos: [],
        client_signature: null,
      }) as unknown as TaskResult,
    [],
  )

  return (
    <div className="space-y-4">
      {/* Target picker + actions */}
      <Card>
        <CardHeader>
          <CardTitle>Report design</CardTitle>
          <CardDescription>
            Design the technical report per service. Set a company-wide default,
            then override any individual service. Blank fields inherit the default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label>Designing</Label>
              <Select value={target} onValueChange={selectTarget}>
                <SelectTrigger className="w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_TARGET}>Company default</SelectItem>
                  {serviceTypes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {target === DEFAULT_TARGET ? (
              <Badge variant="secondary">Applies to every service unless overridden</Badge>
            ) : hasRow ? (
              <Badge>Custom design</Badge>
            ) : (
              <Badge variant="outline">Inherits company default</Badge>
            )}
            <div className="ml-auto flex items-center gap-2">
              {hasRow && (
                <Button variant="outline" onClick={handleReset} disabled={saving}>
                  Reset to default
                </Button>
              )}
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save design
              </Button>
            </div>
          </div>
          {message && (
            <div
              className={cn(
                'rounded-md p-3 text-sm',
                message.type === 'success'
                  ? 'bg-chart-2/10 text-chart-2'
                  : 'bg-destructive/10 text-destructive',
              )}
            >
              {message.text}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Report PDF file name */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report PDF file name</CardTitle>
          <CardDescription>
            {target === DEFAULT_TARGET
              ? 'The naming convention for the report PDF attached to client emails. Applies to every service unless a specific service or client overrides it.'
              : 'Override the file name for this service. Leave blank to inherit the company default. Individual clients can override this again on their record.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <FilenamePatternEditor
            value={filenameDraft}
            onChange={setFilenameDraft}
            placeholder={
              target === DEFAULT_TARGET ? DEFAULT_FILENAME_PATTERN : companyDefaultPattern
            }
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void handleSaveFilename()} disabled={savingFilename}>
              {savingFilename && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save file name
            </Button>
            {target !== DEFAULT_TARGET && filenameFor(target) && (
              <Button
                size="sm"
                variant="outline"
                disabled={savingFilename}
                onClick={() => {
                  setFilenameDraft('')
                  void handleSaveFilename('')
                }}
              >
                Reset to default
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Editor ─────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Branding */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Branding</CardTitle>
              <CardDescription>Masthead, contact details and footer.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-1.5">
                <Label>Header colour</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Header colour"
                    value={draft.headerColor || '#c8102e'}
                    onChange={(e) => patch({ headerColor: e.target.value })}
                    className="h-9 w-12 cursor-pointer rounded border bg-background p-1"
                  />
                  <Input
                    value={draft.headerColor}
                    onChange={(e) => patch({ headerColor: e.target.value })}
                    placeholder="Inherit (service colour / brand red)"
                    className="max-w-xs"
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label>Logo</Label>
                <div className="flex flex-wrap items-center gap-2">
                  {draft.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={draft.logoUrl || '/placeholder.svg'}
                      alt="Logo preview"
                      className="h-10 w-10 rounded border object-contain"
                    />
                  ) : null}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setUploadingLogo(true)
                      const url = await uploadImage(file)
                      setUploadingLogo(false)
                      if (url) patch({ logoUrl: url })
                      if (logoInputRef.current) logoInputRef.current.value = ''
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingLogo}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {uploadingLogo ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <ImagePlus className="mr-2 h-4 w-4" />
                    )}
                    Upload logo
                  </Button>
                  {draft.logoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => patch({ logoUrl: '' })}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave empty to use the company logo from Company settings.
                </p>
              </div>

              <div className="grid gap-1.5">
                <Label>Company name</Label>
                <Input
                  value={draft.companyName}
                  onChange={(e) => patch({ companyName: e.target.value })}
                  placeholder="Inherit company name"
                />
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
                <div className="grid gap-1.5">
                  <Label>Contact phone</Label>
                  <Input
                    value={draft.sections.company_phone}
                    onChange={(e) => patchSection({ company_phone: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Contact email</Label>
                  <Input
                    value={draft.sections.company_email}
                    onChange={(e) => patchSection({ company_email: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Company address</Label>
                <Input
                  value={draft.sections.company_address}
                  onChange={(e) => patchSection({ company_address: e.target.value })}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>Include engineer signature</Label>
                  <p className="text-xs text-muted-foreground">
                    Show the signing engineer block on the report.
                  </p>
                </div>
                <Switch
                  checked={draft.includeSignature}
                  onCheckedChange={(v) => patch({ includeSignature: v })}
                />
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2 sm:gap-3">
                <div className="grid gap-1.5">
                  <Label>Signatory name</Label>
                  <Input
                    value={draft.sections.signatory_name}
                    onChange={(e) => patchSection({ signatory_name: e.target.value })}
                    placeholder="Defaults to the engineer"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Signatory title</Label>
                  <Input
                    value={draft.sections.signatory_title}
                    onChange={(e) => patchSection({ signatory_title: e.target.value })}
                    placeholder="e.g. Fire Engineer"
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label>Standards / “inspected to”</Label>
                <Textarea
                  value={draft.sections.standards}
                  onChange={(e) => patchSection({ standards: e.target.value })}
                  placeholder="e.g. BS 5839-1:2017"
                  rows={2}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Footer text</Label>
                <Textarea
                  value={draft.footerText}
                  onChange={(e) => patch({ footerText: e.target.value })}
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Layout builder */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Layout</CardTitle>
              <CardDescription>
                Reorder, hide, or add sections between the masthead and footer.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <Label>Customise the section layout</Label>
                  <p className="text-xs text-muted-foreground">
                    {target === DEFAULT_TARGET
                      ? 'Off uses the built-in standard layout.'
                      : 'Off inherits the company default layout.'}
                  </p>
                </div>
                <Switch
                  checked={draft.customLayout}
                  onCheckedChange={(v) =>
                    patch({
                      customLayout: v,
                      layout: v && draft.layout.length === 0 ? cloneDefaultLayout() : draft.layout,
                    })
                  }
                />
              </div>

              {draft.customLayout && (
                <>
                  <div className="space-y-2">
                    {draft.layout.map((block, index) => (
                      <BlockRow
                        key={block.id}
                        block={block}
                        index={index}
                        total={draft.layout.length}
                        uploading={uploadingBlockId === block.id}
                        onMove={moveBlock}
                        onToggle={(enabled) => updateBlock(block.id, { enabled })}
                        onRemove={() => removeBlock(block.id)}
                        onProps={(props) => updateBlockProps(block.id, props)}
                        onUploadImage={async (file) => {
                          setUploadingBlockId(block.id)
                          const url = await uploadImage(file)
                          setUploadingBlockId(null)
                          if (url) updateBlockProps(block.id, { imageUrl: url })
                        }}
                      />
                    ))}
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Plus className="mr-2 h-4 w-4" />
                        Add section
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-64">
                      <DropdownMenuLabel>Custom content</DropdownMenuLabel>
                      {CUSTOM_BLOCK_TYPES.map((t) => (
                        <DropdownMenuItem key={t} onSelect={() => addBlock(t)}>
                          {BLOCK_META[t].label}
                        </DropdownMenuItem>
                      ))}
                      {addableData.length > 0 && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>Report data</DropdownMenuLabel>
                          {addableData.map((t) => (
                            <DropdownMenuItem key={t} onSelect={() => addBlock(t)}>
                              {BLOCK_META[t].label}
                            </DropdownMenuItem>
                          ))}
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Live preview ───────────────────────────────────────── */}
        <div className="space-y-2 lg:sticky lg:top-4 lg:self-start">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Eye className="h-4 w-4" />
            Live preview
            <span className="font-normal">(sample data)</span>
          </div>
          <div className="max-h-[80vh] overflow-auto rounded-lg border bg-muted/30 p-3">
            <div className="origin-top scale-[0.82]">
              <ServiceReport
                task={sampleTask}
                result={sampleResult}
                template={previewTemplate}
                companyInfo={null}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// A single editable row in the layout builder.
function BlockRow({
  block,
  index,
  total,
  uploading,
  onMove,
  onToggle,
  onRemove,
  onProps,
  onUploadImage,
}: {
  block: ReportBlock
  index: number
  total: number
  uploading: boolean
  onMove: (index: number, dir: -1 | 1) => void
  onToggle: (enabled: boolean) => void
  onRemove: () => void
  onProps: (props: Record<string, unknown>) => void
  onUploadImage: (file: File) => void
}) {
  const meta = BLOCK_META[block.type]
  const isCustom = meta.kind === 'custom'
  const props = block.props ?? {}
  const fileRef = useRef<HTMLInputElement>(null)
  const enabled = block.enabled !== false

  return (
    <div className={cn('rounded-md border p-2', !enabled && 'opacity-60')}>
      <div className="flex items-center gap-2">
        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="flex flex-col">
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => onMove(index, -1)}
              disabled={index === 0}
              className="text-muted-foreground disabled:opacity-30"
              aria-label="Move up"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onMove(index, 1)}
              disabled={index === total - 1}
              className="text-muted-foreground disabled:opacity-30"
              aria-label="Move down"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{meta.label}</p>
          <p className="truncate text-xs text-muted-foreground">{meta.description}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} aria-label="Show section" />
        {isCustom && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onRemove}
            aria-label="Remove section"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>

      {/* Per-type editors for custom blocks */}
      {isCustom && block.type === 'heading' && (
        <div className="mt-2 grid gap-2 pl-6 sm:grid-cols-[1fr_auto]">
          <VariableTextInput
            value={String(props.content ?? '')}
            onChange={(content) => onProps({ content })}
            placeholder="Heading text"
          />
          <Select
            value={String(props.level ?? 1)}
            onValueChange={(v) => onProps({ level: Number(v) })}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Large</SelectItem>
              <SelectItem value="2">Small</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {isCustom && block.type === 'text' && (
        <div className="mt-2 pl-6">
          <VariableTextInput
            multiline
            value={String(props.content ?? '')}
            onChange={(content) => onProps({ content })}
            placeholder="Paragraph text"
          />
        </div>
      )}

      {isCustom && block.type === 'image' && (
        <div className="mt-2 space-y-2 pl-6">
          <div className="flex flex-wrap items-center gap-2">
            {props.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={String(props.imageUrl) || '/placeholder.svg'}
                alt="Block image"
                className="h-12 w-12 rounded border object-contain"
              />
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onUploadImage(file)
                if (fileRef.current) fileRef.current.value = ''
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="mr-2 h-4 w-4" />
              )}
              {props.imageUrl ? 'Replace image' : 'Upload image'}
            </Button>
          </div>
          <Input
            value={String(props.caption ?? '')}
            onChange={(e) => onProps({ caption: e.target.value })}
            placeholder="Caption (optional)"
          />
        </div>
      )}

      {isCustom && block.type === 'spacer' && (
        <div className="mt-2 pl-6">
          <Select value={String(props.size ?? 'md')} onValueChange={(v) => onProps({ size: v })}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">Small gap</SelectItem>
              <SelectItem value="md">Medium gap</SelectItem>
              <SelectItem value="lg">Large gap</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}

// A text field (single or multi-line) with quick {{variable}} insert buttons.
function VariableTextInput({
  value,
  onChange,
  placeholder,
  multiline,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  multiline?: boolean
}) {
  return (
    <div className="space-y-1.5">
      {multiline ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
        />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
      <div className="flex flex-wrap gap-1">
        {REPORT_TEXT_VARIABLES.map((v) => (
          <button
            key={v.token}
            type="button"
            onClick={() => onChange(`${value}{{${v.token}}}`)}
            className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted-foreground/20"
            title={`Insert ${v.label}`}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  )
}
