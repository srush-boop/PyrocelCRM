'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { FileText, Upload, X, Sparkles, Loader2 } from 'lucide-react'
import {
  saveSpecTemplate,
  uploadSpecTemplateDoc,
  removeSpecTemplateDoc,
} from '@/app/(dashboard)/dashboard/sales/quote-config-actions'
import { WORK_TYPES, workTypeLabel } from '@/lib/sales'
import type { SystemType, SystemSpecTemplate } from '@/lib/types/database'
import { SystemColorDot } from '@/lib/system-types'

export function SpecTemplatesManager({
  systemTypes,
  templates,
}: {
  systemTypes: SystemType[]
  templates: SystemSpecTemplate[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [systemTypeId, setSystemTypeId] = useState<string>(systemTypes[0]?.id ?? '')
  const [workType, setWorkType] = useState<string>(WORK_TYPES[0].code)

  // Map of existing template specs keyed by `${systemTypeId}:${workType}`.
  const templateMap = useMemo(() => {
    const map = new Map<string, SystemSpecTemplate>()
    for (const t of templates) {
      if (t.system_type_id) map.set(`${t.system_type_id}:${t.work_type}`, t)
    }
    return map
  }, [templates])

  const currentKey = `${systemTypeId}:${workType}`
  const existing = templateMap.get(currentKey)
  const [spec, setSpec] = useState<string>(existing?.specification ?? '')
  // Track which key the textarea reflects so switching selectors reloads it.
  const [loadedKey, setLoadedKey] = useState<string>(currentKey)
  if (loadedKey !== currentKey) {
    setLoadedKey(currentKey)
    setSpec(existing?.specification ?? '')
  }

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  function handleSave() {
    if (!systemTypeId) {
      toast.error('Select a system type first')
      return
    }
    startTransition(async () => {
      const res = await saveSpecTemplate({
        system_type_id: systemTypeId,
        work_type: workType,
        specification: spec,
      })
      if (res.ok) {
        toast.success('Template saved')
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not save template')
      }
    })
  }

  function handleUpload(file: File) {
    if (!systemTypeId) {
      toast.error('Select a system type first')
      return
    }
    setUploading(true)
    const formData = new FormData()
    formData.set('system_type_id', systemTypeId)
    formData.set('work_type', workType)
    formData.set('file', file)
    uploadSpecTemplateDoc(formData)
      .then((res) => {
        if (res.ok) {
          toast.success(`Uploaded ${res.fileName} (${res.charCount?.toLocaleString()} characters)`) 
          router.refresh()
        } else {
          toast.error(res.error ?? 'Could not upload the document')
        }
      })
      .finally(() => {
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      })
  }

  function handleRemoveDoc() {
    startTransition(async () => {
      const res = await removeSpecTemplateDoc({ system_type_id: systemTypeId, work_type: workType })
      if (res.ok) {
        toast.success('Removed uploaded document')
        router.refresh()
      } else {
        toast.error(res.error ?? 'Could not remove the document')
      }
    })
  }

  function handleUseDocText() {
    if (existing?.source_text) {
      setSpec(existing.source_text)
      toast.info('Loaded document text into the editor. Review and save.')
    }
  }

  if (systemTypes.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No system types yet. Add a system type (with a code) first.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Select template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>System type</Label>
            <Select value={systemTypeId} onValueChange={setSystemTypeId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {systemTypes.map((st) => (
                  <SelectItem key={st.id} value={st.id}>
                    <span className="flex items-center gap-2">
                      <SystemColorDot color={st.color} />
                      {st.code ? `${st.code} — ${st.name}` : st.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Type of work</Label>
            <Select value={workType} onValueChange={setWorkType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORK_TYPES.map((w) => (
                  <SelectItem key={w.code} value={w.code}>
                    {w.code} — {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-muted-foreground">
            {existing ? (
              <Badge variant="secondary">Template exists</Badge>
            ) : (
              <Badge variant="outline">No template yet</Badge>
            )}
          </div>

          <div className="grid gap-2 border-t pt-4">
            <Label className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Sample specification document
            </Label>
            <p className="text-xs text-muted-foreground">
              Upload a sample spec (Word or text). Its content becomes the AI knowledge base used to
              draft quote specifications for this system and type of work.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.txt,.md,text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleUpload(file)
              }}
            />

            {existing?.source_file_name ? (
              <div className="grid gap-2 rounded-md border bg-muted/40 p-2.5">
                <div className="flex items-start gap-2">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    {existing.source_file_url ? (
                      <a
                        href={existing.source_file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-sm font-medium text-primary hover:underline"
                      >
                        {existing.source_file_name}
                      </a>
                    ) : (
                      <span className="block truncate text-sm font-medium">
                        {existing.source_file_name}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {existing.source_text?.length.toLocaleString() ?? 0} characters parsed
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={handleRemoveDoc}
                    disabled={isPending}
                    aria-label="Remove document"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Replace
                  </Button>
                  {existing.source_text ? (
                    <Button variant="outline" size="sm" onClick={handleUseDocText}>
                      Use as master spec
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                )}
                Upload document
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Specification — {workTypeLabel(workType)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
            rows={18}
            placeholder="Master specification text for this system and type of work..."
          />
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? 'Saving...' : 'Save template'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
