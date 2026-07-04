'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowLeft,
  Pencil,
  Download,
  Send,
  Check,
  X,
  PenLine,
  GitBranch,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDateUK, formatDateTimeUK } from '@/lib/utils'
import { RAMS_STATUS_META } from '@/lib/rams/risk'
import { RiskScoreBadge, HazardRiskMatrix } from '@/components/rams/risk-matrix'
import { SignaturePad } from '@/components/rams/signature-pad'
import {
  submitForApproval,
  decideRams,
  confirmRams,
  createRevision,
} from '@/lib/rams/actions'
import { draftRamsApprovalEmail } from '@/lib/ai/draft-rams-approval-email'
import type { EmailTone } from '@/lib/ai/shared'
import type {
  RamsDocument,
  RamsEngineerConfirmation,
  RamsSignature,
  RamsRevisionSummary,
} from '@/lib/rams/types'

interface RamsDetailProps {
  doc: RamsDocument
  revisionHistory: RamsRevisionSummary[]
  clientName: string | null
  siteName: string | null
  preparedByName: string | null
  approvedByName: string | null
  confirmations: RamsEngineerConfirmation[]
  signatures: RamsSignature[]
  currentUserId: string
  canApprove: boolean
  canManage: boolean
}

export function RamsDetail({
  doc,
  revisionHistory,
  clientName,
  siteName,
  preparedByName,
  approvedByName,
  confirmations,
  signatures,
  currentUserId,
  canApprove,
  canManage,
}: RamsDetailProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [approvalOpen, setApprovalOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)

  const [recipientEmail, setRecipientEmail] = useState(doc.manager_email ?? '')
  const [recipientName, setRecipientName] = useState('')
  const [approvalSubject, setApprovalSubject] = useState('')
  const [approvalMessage, setApprovalMessage] = useState('')
  const [approvalTone, setApprovalTone] = useState<EmailTone>('professional')
  const [approvalInstructions, setApprovalInstructions] = useState('')
  const [isDraftingApproval, setIsDraftingApproval] = useState(false)
  const [rejectComments, setRejectComments] = useState('')
  const [confirmSig, setConfirmSig] = useState<string | null>(null)
  const [confirmNotes, setConfirmNotes] = useState('')
  const [revisionOpen, setRevisionOpen] = useState(false)
  const [revisionNotes, setRevisionNotes] = useState('')

  const meta = RAMS_STATUS_META[doc.status] || RAMS_STATUS_META.draft
  const myConfirmation = confirmations.find((c) => c.engineer_id === currentUserId)

  async function handleAiDraftApproval() {
    setIsDraftingApproval(true)
    try {
      const res = await draftRamsApprovalEmail({
        ramsId: doc.id,
        recipientName: recipientName.trim() || null,
        tone: approvalTone,
        instructions: approvalInstructions.trim() || undefined,
      })
      if (res.ok && res.body) {
        if (res.subject) setApprovalSubject(res.subject)
        setApprovalMessage(res.body)
        toast.success('Draft generated — review and edit before sending')
      } else {
        toast.error(res.error ?? 'Could not generate a draft')
      }
    } finally {
      setIsDraftingApproval(false)
    }
  }

  async function handleSendApproval() {
    if (!recipientEmail.trim()) {
      toast.error('Enter an approver email')
      return
    }
    setBusy(true)
    const res = await submitForApproval(
      doc.id,
      {
        email: recipientEmail.trim(),
        name: recipientName.trim() || null,
      },
      {
        subject: approvalSubject.trim() || undefined,
        message: approvalMessage.trim() || undefined,
      },
    )
    setBusy(false)
    if (!res.success) return toast.error(res.error)
    toast.success('Sent for approval')
    setApprovalOpen(false)
    router.refresh()
  }

  async function handleDecision(decision: 'approved' | 'rejected', comments: string | null) {
    setBusy(true)
    const res = await decideRams(doc.id, decision, comments)
    setBusy(false)
    if (!res.success) return toast.error(res.error)
    toast.success(decision === 'approved' ? 'RAMS approved' : 'RAMS rejected')
    setRejectOpen(false)
    router.refresh()
  }

  async function handleConfirm() {
    setBusy(true)
    const res = await confirmRams(doc.id, confirmSig, confirmNotes.trim() || null)
    setBusy(false)
    if (!res.success) return toast.error(res.error)
    toast.success('Confirmation recorded')
    setConfirmOpen(false)
    router.refresh()
  }

  async function handleRevision() {
    if (!revisionNotes.trim()) {
      return toast.error('Describe what is changing in this revision.')
    }
    setBusy(true)
    const res = await createRevision(doc.id, revisionNotes.trim())
    setBusy(false)
    if (!res.success) return toast.error(res.error)
    setRevisionOpen(false)
    setRevisionNotes('')
    toast.success('New revision created')
    router.push(`/dashboard/rams/${res.data!.id}/edit`)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link href="/dashboard/rams">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to RAMS
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{doc.title}</h1>
            <Badge variant="outline" className={meta.className}>
              {meta.label}
            </Badge>
          </div>
          <p className="font-mono text-sm text-muted-foreground">
            {doc.rams_number} · Revision {doc.revision}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/rams/${doc.id}/pdf`} target="_blank" rel="noreferrer">
              <Download className="mr-2 h-4 w-4" />
              PDF
            </a>
          </Button>
          {canManage && doc.status === 'draft' && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/rams/${doc.id}/edit`}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </Button>
          )}
          {canManage && (doc.status === 'draft' || doc.status === 'rejected') && (
            <Button size="sm" onClick={() => setApprovalOpen(true)}>
              <Send className="mr-2 h-4 w-4" />
              Send for Approval
            </Button>
          )}
          {canApprove && doc.status === 'pending_approval' && (
            <>
              <Button
                size="sm"
                onClick={() => handleDecision('approved', null)}
                disabled={busy}
              >
                <Check className="mr-2 h-4 w-4" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setRejectOpen(true)}
              >
                <X className="mr-2 h-4 w-4" />
                Reject
              </Button>
            </>
          )}
          {doc.status === 'approved' && (
            <Button
              size="sm"
              variant={myConfirmation?.status === 'confirmed' ? 'outline' : 'default'}
              onClick={() => setConfirmOpen(true)}
              disabled={myConfirmation?.status === 'confirmed'}
            >
              <PenLine className="mr-2 h-4 w-4" />
              {myConfirmation?.status === 'confirmed'
                ? 'Confirmed'
                : 'Read & Confirm'}
            </Button>
          )}
          {canManage && doc.status === 'approved' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRevisionOpen(true)}
              disabled={busy}
            >
              <GitBranch className="mr-2 h-4 w-4" />
              New Revision
            </Button>
          )}
        </div>
      </div>

      {/* Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Client" value={clientName || '—'} />
        <InfoCard label="Site / Location" value={doc.work_location || siteName || '—'} />
        <InfoCard
          label="Planned Dates"
          value={`${doc.planned_start_date ? formatDateUK(doc.planned_start_date) : '—'} — ${
            doc.no_end_date
              ? 'Ongoing'
              : doc.planned_end_date
                ? formatDateUK(doc.planned_end_date)
                : '—'
          }`}
        />
        <InfoCard label="Job Number" value={doc.job_number || '—'} />
      </div>

      {doc.work_description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Description of Works</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {doc.work_description}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Risk assessment */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Risk Assessment</CardTitle>
        </CardHeader>
        <CardContent>
          {doc.selected_hazards?.length ? (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hazard</TableHead>
                  <TableHead>Initial</TableHead>
                  <TableHead>Residual</TableHead>
                  <TableHead className="hidden lg:table-cell">Risk Matrix</TableHead>
                  <TableHead>Controls</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {doc.selected_hazards.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="align-top">
                      <p className="font-medium">{h.description}</p>
                      {h.potential_consequences && (
                        <p className="text-xs text-muted-foreground">
                          {h.potential_consequences}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <RiskScoreBadge likelihood={h.likelihood} severity={h.severity} />
                    </TableCell>
                    <TableCell className="align-top">
                      <RiskScoreBadge
                        likelihood={h.residual_likelihood}
                        severity={h.residual_severity}
                      />
                    </TableCell>
                    <TableCell className="hidden align-top lg:table-cell">
                      <HazardRiskMatrix
                        likelihood={h.likelihood}
                        severity={h.severity}
                        residualLikelihood={h.residual_likelihood}
                        residualSeverity={h.residual_severity}
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <ul className="list-disc pl-4 text-sm">
                        {h.controls.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 hidden text-xs text-muted-foreground lg:block">
              Risk matrix: <span className="font-medium">I</span> = initial (pre-control) risk,{' '}
              <span className="font-medium">R</span> = residual (post-control) risk. Score = likelihood ×
              severity.
            </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No hazards recorded.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">PPE Requirements</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {doc.ppe_requirements?.length ? (
              doc.ppe_requirements.map((p) => (
                <Badge key={p} variant="secondary">
                  {p}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">None specified.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Equipment &amp; Tools</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {doc.equipment_list?.length ? (
              doc.equipment_list.map((p) => (
                <Badge key={p} variant="secondary">
                  {p}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">None specified.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {doc.method_steps?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Method Statement</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {doc.method_steps.map((s) => (
                <li key={s.step} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                    {s.step}
                  </span>
                  <p className="text-sm leading-relaxed">{s.description}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {(doc.emergency_procedures || doc.emergency_hospital_info?.name) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Emergency Arrangements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {doc.emergency_procedures && (
              <p className="whitespace-pre-wrap leading-relaxed">
                {doc.emergency_procedures}
              </p>
            )}
            {doc.emergency_hospital_info?.name && (
              <p className="text-muted-foreground">
                Nearest hospital: {doc.emergency_hospital_info.name}
                {doc.emergency_hospital_info.address
                  ? `, ${doc.emergency_hospital_info.address}`
                  : ''}
                {doc.emergency_hospital_info.phone
                  ? ` (${doc.emergency_hospital_info.phone})`
                  : ''}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sign-off & confirmations */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Prepared by" value={preparedByName || '—'} />
            <Row
              label="Prepared date"
              value={doc.prepared_date ? formatDateUK(doc.prepared_date) : '—'}
            />
            <Row label="Approved by" value={approvedByName || '—'} />
            <Row
              label="Approved date"
              value={doc.approved_date ? formatDateUK(doc.approved_date) : '—'}
            />
            {doc.revision_notes && (
              <div className="rounded-md bg-muted p-3 text-muted-foreground">
                <p className="font-medium text-foreground">Notes</p>
                {doc.revision_notes}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Read &amp; Understood Confirmations
            </CardTitle>
          </CardHeader>
          <CardContent>
            {confirmations.length ? (
              <ul className="space-y-2 text-sm">
                {confirmations.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <span>{c.engineer?.full_name || c.engineer?.email || 'Engineer'}</span>
                    {c.status === 'confirmed' ? (
                      <Badge
                        variant="outline"
                        className="bg-emerald-100 text-emerald-800 border-emerald-200"
                      >
                        Confirmed{' '}
                        {c.confirmed_at ? formatDateTimeUK(c.confirmed_at) : ''}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Pending</Badge>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No confirmations recorded yet.
              </p>
            )}
          </CardContent>
        </Card>

        {revisionHistory.length > 1 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Revision History</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {revisionHistory.map((rev) => {
                  const revMeta = RAMS_STATUS_META[rev.status] || RAMS_STATUS_META.draft
                  const isCurrentDoc = rev.id === doc.id
                  return (
                    <li
                      key={rev.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">R{rev.revision}</span>
                          <Badge variant="outline" className={revMeta.className}>
                            {revMeta.label}
                          </Badge>
                          {rev.is_current_revision && (
                            <Badge
                              variant="outline"
                              className="border-emerald-200 bg-emerald-100 text-emerald-800"
                            >
                              Current
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDateUK(rev.created_at)}
                          {rev.revision_notes ? ` · ${rev.revision_notes}` : ''}
                        </p>
                      </div>
                      {isCurrentDoc ? (
                        <span className="text-xs text-muted-foreground">Viewing</span>
                      ) : (
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/dashboard/rams/${rev.id}`}>View</Link>
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Send-for-approval dialog */}
      <Dialog open={approvalOpen} onOpenChange={setApprovalOpen}>
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send for Approval</DialogTitle>
            <DialogDescription>
              The approver receives a secure link to review and sign off this RAMS.
            </DialogDescription>
          </DialogHeader>
          {/* min-h-0 lets this flex child shrink and scroll instead of pushing
              the footer off-screen. */}
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto py-2">
            <div className="grid gap-2">
              <Label>Approver Email *</Label>
              <Input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="approver@example.com"
              />
            </div>
            <div className="grid gap-2">
              <Label>Approver Name</Label>
              <Input
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="grid gap-2">
              <Label>Subject</Label>
              <Input
                value={approvalSubject}
                onChange={(e) => setApprovalSubject(e.target.value)}
                placeholder={`RAMS approval requested: ${doc.rams_number}`}
              />
            </div>
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="approval-message">Covering message</Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={approvalTone}
                    onValueChange={(v) => setApprovalTone(v as EmailTone)}
                  >
                    <SelectTrigger className="h-8 w-[130px]" aria-label="Draft tone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="friendly">Friendly</SelectItem>
                      <SelectItem value="concise">Concise</SelectItem>
                      <SelectItem value="formal">Formal</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={handleAiDraftApproval}
                    disabled={isDraftingApproval}
                  >
                    {isDraftingApproval ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    {isDraftingApproval ? 'Drafting…' : 'AI draft'}
                  </Button>
                </div>
              </div>
              <Input
                value={approvalInstructions}
                onChange={(e) => setApprovalInstructions(e.target.value)}
                placeholder="Optional: steer the AI draft, e.g. stress the tight deadline"
                aria-label="Additional instructions for the AI draft"
              />
              <Textarea
                id="approval-message"
                value={approvalMessage}
                onChange={(e) => setApprovalMessage(e.target.value)}
                rows={7}
                className="resize-y"
                placeholder="Optional covering note. Leave blank to use the standard message. The secure approval link is added automatically."
              />
              <p className="text-xs text-muted-foreground">
                AI drafts use this RAMS&apos;s details. Always review before sending.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendApproval} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject RAMS</DialogTitle>
            <DialogDescription>
              Provide a reason so the author can address it.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectComments}
            onChange={(e) => setRejectComments(e.target.value)}
            placeholder="Reason for rejection"
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleDecision('rejected', rejectComments.trim() || null)}
              disabled={busy}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New revision dialog — captures the change reason for the audit trail */}
      <Dialog open={revisionOpen} onOpenChange={setRevisionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Revision</DialogTitle>
            <DialogDescription>
              This creates R{(doc.revision || 0) + 1} as an editable draft and
              supersedes the current approved version. Record what is changing and why.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="revision-notes">Reason for revision</Label>
            <Textarea
              id="revision-notes"
              value={revisionNotes}
              onChange={(e) => setRevisionNotes(e.target.value)}
              placeholder="e.g. Updated access equipment following site survey; added working-at-height controls."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevisionOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRevision} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Revision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm (read & understood) dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Read &amp; Understood</DialogTitle>
            <DialogDescription>
              Confirm you have read and understood this RAMS. Add your signature
              below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <SignaturePad onChange={setConfirmSig} />
            <div className="grid gap-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={confirmNotes}
                onChange={(e) => setConfirmNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 font-medium">{value}</p>
      </CardContent>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}
