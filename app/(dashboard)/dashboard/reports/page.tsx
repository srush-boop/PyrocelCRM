'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Calendar } from '@/components/ui/calendar'
import { Mail, AlertCircle, CheckCircle, Search, Filter, CalendarIcon, X, Send, Eye } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { formatDateUK, cn } from '@/lib/utils'
import { isDamperService } from '@/lib/dampers'
import { isExtinguisherService } from '@/lib/extinguishers'

/** Resolve the correct report viewer path for a service type. */
function reportPath(serviceName: string, taskId: string): string {
  if (isDamperService(serviceName)) return `/dashboard/dampers/report/${taskId}`
  if (isExtinguisherService(serviceName)) return `/dashboard/extinguishers/report/${taskId}`
  return `/dashboard/reports/${taskId}`
}

interface TaskReport {
  id: string
  taskId: string
  referenceNumber: string
  siteName: string
  siteId: string
  clientName: string
  clientId: string
  serviceName: string
  serviceTypeId: string
  systemTypeId: string
  systemTypeName: string
  engineerName: string
  engineerId: string
  clientEmail: string
  overallStatus: string
  emailSentAt: string | null
  createdAt: string
  completedAt: string | null
}

interface FilterOption {
  id: string
  name: string
}

export default function ReportsPage() {
  const supabase = createClient()
  const [reports, setReports] = useState<TaskReport[]>([])
  const [loading, setLoading] = useState(true)

  // Multi-select + bulk email
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // When set, the email dialog targets a single report instead of the bulk selection
  const [singleReport, setSingleReport] = useState<TaskReport | null>(null)
  const [emailDialogOpen, setEmailDialogOpen] = useState(false)
  const [recipientMode, setRecipientMode] = useState<'default' | 'alternate'>('default')
  const [alternateEmails, setAlternateEmails] = useState<string[]>([])
  const [newAlternateEmail, setNewAlternateEmail] = useState('')
  const [bulkSending, setBulkSending] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ sent: number; failed: number } | null>(null)

  // Filter states
  const [search, setSearch] = useState('')
  const [selectedSite, setSelectedSite] = useState<string>('all')
  const [selectedClient, setSelectedClient] = useState<string>('all')
  const [selectedEngineer, setSelectedEngineer] = useState<string>('all')
  const [selectedServiceType, setSelectedServiceType] = useState<string>('all')
  const [selectedSystemType, setSelectedSystemType] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined)
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined)
  const [emailStatus, setEmailStatus] = useState<string>('all')

  // Filter options
  const [sites, setSites] = useState<FilterOption[]>([])
  const [clients, setClients] = useState<FilterOption[]>([])
  const [engineers, setEngineers] = useState<FilterOption[]>([])
  const [serviceTypes, setServiceTypes] = useState<FilterOption[]>([])
  const [systemTypes, setSystemTypes] = useState<FilterOption[]>([])

  useEffect(() => {
    loadReports()
    loadFilterOptions()
  }, [])

  const loadFilterOptions = async () => {
    const [sitesRes, clientsRes, engineersRes, serviceTypesRes, systemTypesRes] = await Promise.all([
      supabase.from('sites').select('id, name').order('name'),
      supabase.from('clients').select('id, name').order('name'),
      supabase.from('profiles').select('id, full_name, email').eq('role', 'engineer'),
      supabase.from('service_types').select('id, name').order('name'),
      supabase.from('system_types').select('id, name').order('name'),
    ])

    setSites(sitesRes.data?.map(s => ({ id: s.id, name: s.name })) || [])
    setClients(clientsRes.data?.map(c => ({ id: c.id, name: c.name })) || [])
    setEngineers(engineersRes.data?.map(e => ({ id: e.id, name: e.full_name || e.email })) || [])
    setServiceTypes(serviceTypesRes.data?.map(st => ({ id: st.id, name: st.name })) || [])
    setSystemTypes(systemTypesRes.data?.map(st => ({ id: st.id, name: st.name })) || [])
  }

  const loadReports = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('task_results')
        .select(`
          id,
          task_id,
          reference_number,
          overall_status,
          email_sent_at,
          created_at,
          tasks(
            id,
            completed_at,
            assigned_engineer_id,
            profiles:assigned_engineer_id(id, full_name, email),
            site_services(
              site_id,
              service_type_id,
              sites(id, name, contact_email, client_id, clients(id, name)),
              service_types(id, name, system_type_id, system_types(id, name))
            )
          )
        `)
        .order('created_at', { ascending: false })
        .limit(200)

      if (error) throw error

      const formatted = data?.map((item: any) => ({
        id: item.id,
        taskId: item.task_id,
        referenceNumber: item.reference_number || '-',
        siteName: item.tasks?.site_services?.sites?.name || 'Unknown',
        siteId: item.tasks?.site_services?.sites?.id || '',
        clientName: item.tasks?.site_services?.sites?.clients?.name || '',
        clientId: item.tasks?.site_services?.sites?.client_id || '',
        serviceName: item.tasks?.site_services?.service_types?.name || 'Unknown',
        serviceTypeId: item.tasks?.site_services?.service_types?.id || '',
        systemTypeId: item.tasks?.site_services?.service_types?.system_type_id || '',
        systemTypeName: item.tasks?.site_services?.service_types?.system_types?.name || '',
        engineerName: item.tasks?.profiles?.full_name || item.tasks?.profiles?.email || 'Unassigned',
        engineerId: item.tasks?.assigned_engineer_id || '',
        clientEmail: item.tasks?.site_services?.sites?.contact_email || '',
        overallStatus: item.overall_status,
        emailSentAt: item.email_sent_at,
        createdAt: item.created_at,
        completedAt: item.tasks?.completed_at,
      })) || []

      setReports(formatted)
    } catch (error) {
      console.error('Error loading reports:', error)
      toast.error('Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      // Text search
      if (search) {
        const searchLower = search.toLowerCase()
        const matchesSearch =
          report.referenceNumber.toLowerCase().includes(searchLower) ||
          report.siteName.toLowerCase().includes(searchLower) ||
          report.serviceName.toLowerCase().includes(searchLower) ||
          report.engineerName.toLowerCase().includes(searchLower) ||
          report.clientEmail.toLowerCase().includes(searchLower)
        if (!matchesSearch) return false
      }

      // Site filter
      if (selectedSite !== 'all' && report.siteId !== selectedSite) return false

      // Client filter
      if (selectedClient !== 'all') {
        if (selectedClient === 'unassigned' && report.clientId) return false
        if (selectedClient !== 'unassigned' && report.clientId !== selectedClient) return false
      }

      // Engineer filter
      if (selectedEngineer !== 'all' && report.engineerId !== selectedEngineer) return false

      // Service type filter
      if (selectedServiceType !== 'all' && report.serviceTypeId !== selectedServiceType) return false

      // System type filter
      if (selectedSystemType !== 'all' && report.systemTypeId !== selectedSystemType) return false

      // Status filter
      if (selectedStatus !== 'all' && report.overallStatus !== selectedStatus) return false

      // Email status filter
      if (emailStatus === 'sent' && !report.emailSentAt) return false
      if (emailStatus === 'pending' && report.emailSentAt) return false

      // Date range filter
      const reportDate = new Date(report.completedAt || report.createdAt)
      if (dateFrom && reportDate < dateFrom) return false
      if (dateTo) {
        const endOfDay = new Date(dateTo)
        endOfDay.setHours(23, 59, 59, 999)
        if (reportDate > endOfDay) return false
      }

      return true
    })
  }, [reports, search, selectedSite, selectedClient, selectedEngineer, selectedServiceType, selectedSystemType, selectedStatus, emailStatus, dateFrom, dateTo])

  const clearFilters = () => {
    setSearch('')
    setSelectedSite('all')
    setSelectedClient('all')
    setSelectedEngineer('all')
    setSelectedServiceType('all')
    setSelectedSystemType('all')
    setSelectedStatus('all')
    setEmailStatus('all')
    setDateFrom(undefined)
    setDateTo(undefined)
  }

  const hasActiveFilters = search || selectedSite !== 'all' || selectedClient !== 'all' || 
    selectedEngineer !== 'all' || selectedServiceType !== 'all' || selectedSystemType !== 'all' || 
    selectedStatus !== 'all' || emailStatus !== 'all' || dateFrom || dateTo

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(filteredReports.map((r) => r.id)) : new Set())
  }

  const addAlternateEmail = () => {
    const email = newAlternateEmail.trim()
    if (email && !alternateEmails.includes(email)) {
      setAlternateEmails([...alternateEmails, email])
      setNewAlternateEmail('')
    }
  }

  const openEmailDialog = () => {
    setSingleReport(null)
    setRecipientMode('default')
    setAlternateEmails([])
    setNewAlternateEmail('')
    setBulkResult(null)
    setEmailDialogOpen(true)
  }

  const openResendDialog = (report: TaskReport) => {
    setSingleReport(report)
    setRecipientMode('default')
    setAlternateEmails([])
    setNewAlternateEmail('')
    setBulkResult(null)
    setEmailDialogOpen(true)
  }

  const handleBulkSend = async () => {
    const selected = singleReport ? [singleReport] : reports.filter((r) => selectedIds.has(r.id))
    if (selected.length === 0) return
    if (recipientMode === 'alternate' && alternateEmails.length === 0) {
      toast.error('Add at least one alternate email address')
      return
    }

    setBulkSending(true)
    let sent = 0
    let failed = 0

    for (const report of selected) {
      try {
        const response = await fetch('/api/send-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskId: report.taskId,
            resend: true,
            ...(recipientMode === 'alternate' ? { emails: alternateEmails } : {}),
          }),
        })
        if (response.ok) sent += 1
        else failed += 1
      } catch {
        failed += 1
      }
    }

    setBulkSending(false)
    setBulkResult({ sent, failed })
    if (sent > 0) toast.success(`Sent ${sent} report${sent === 1 ? '' : 's'}`)
    if (failed > 0) toast.error(`Failed to send ${failed} report${failed === 1 ? '' : 's'}`)
    setSelectedIds(new Set())
    loadReports()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Service Reports</h1>
        <p className="text-muted-foreground">View and resend service completion reports</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Reports</CardTitle>
              <CardDescription>
                {filteredReports.length} of {reports.length} reports
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-2">
                  <X className="h-4 w-4" />
                  Clear Filters
                </Button>
              )}
              <Button
                size="sm"
                onClick={openEmailDialog}
                disabled={selectedIds.size === 0}
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                Email Selected{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search and Quick Filters Row */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search reports..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pass">Pass</SelectItem>
                <SelectItem value="fail">Fail</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="no_access">No Access</SelectItem>
              </SelectContent>
            </Select>

            <Select value={emailStatus} onValueChange={setEmailStatus}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Email Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Emails</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="pending">Not Sent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Advanced Filters Row */}
          <div className="flex flex-wrap items-end gap-3 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              Filters:
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Client</Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  <SelectItem value="unassigned">No Client</SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Site</Label>
              <Select value={selectedSite} onValueChange={setSelectedSite}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites</SelectItem>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Engineer</Label>
              <Select value={selectedEngineer} onValueChange={setSelectedEngineer}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Engineers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Engineers</SelectItem>
                  {engineers.map((eng) => (
                    <SelectItem key={eng.id} value={eng.id}>
                      {eng.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">System Type</Label>
              <Select value={selectedSystemType} onValueChange={setSelectedSystemType}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Systems" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Systems</SelectItem>
                  {systemTypes.map((st) => (
                    <SelectItem key={st.id} value={st.id}>
                      {st.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Service Type</Label>
              <Select value={selectedServiceType} onValueChange={setSelectedServiceType}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Services" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Services</SelectItem>
                  {serviceTypes.map((st) => (
                    <SelectItem key={st.id} value={st.id}>
                      {st.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Date From</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[140px] justify-start text-left font-normal",
                      !dateFrom && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "From"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Date To</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[140px] justify-start text-left font-normal",
                      !dateTo && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "dd/MM/yyyy") : "To"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={
                        filteredReports.length > 0 &&
                        filteredReports.every((r) => selectedIds.has(r.id))
                      }
                      onCheckedChange={(checked) => toggleAll(checked === true)}
                      aria-label="Select all reports"
                    />
                  </TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="hidden xl:table-cell">Client</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead className="hidden lg:table-cell">Engineer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden xl:table-cell">Email Sent</TableHead>
                  <TableHead className="hidden lg:table-cell">Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center">
                      Loading reports...
                    </TableCell>
                  </TableRow>
                ) : filteredReports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-24 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
                        <p className="text-muted-foreground">No reports found matching your filters</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReports.map((report) => (
                    <TableRow key={report.id} data-state={selectedIds.has(report.id) ? 'selected' : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(report.id)}
                          onCheckedChange={() => toggleOne(report.id)}
                          aria-label={`Select report ${report.referenceNumber}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs font-medium">{report.referenceNumber}</TableCell>
                      <TableCell className="hidden xl:table-cell">{report.clientName || <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell className="font-medium">{report.siteName}</TableCell>
                      <TableCell>{report.serviceName}</TableCell>
                      <TableCell className="hidden lg:table-cell">{report.engineerName}</TableCell>
                      <TableCell>
                        <Badge
                          variant={report.overallStatus === 'fail' ? 'destructive' : 'default'}
                          className={
                            report.overallStatus === 'pass'
                              ? 'bg-green-600 text-white hover:bg-green-600/90'
                              : report.overallStatus === 'partial' || report.overallStatus === 'no_access'
                              ? 'bg-amber-500 text-white hover:bg-amber-500/90'
                              : undefined
                          }
                        >
                          {report.overallStatus === 'pass'
                            ? 'Pass'
                            : report.overallStatus === 'fail'
                            ? 'Fail'
                            : report.overallStatus === 'no_access'
                            ? 'No Access'
                            : 'Partial'}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        {report.emailSentAt ? (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="text-sm">
                              {formatDateUK(report.emailSentAt)}
                            </span>
                          </div>
                        ) : (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <AlertCircle className="h-4 w-4 text-yellow-600" />
                            Pending
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-sm lg:table-cell">
                        {report.completedAt 
                          ? formatDateUK(report.completedAt)
                          : formatDateUK(report.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" asChild className="gap-2">
                            <Link
                              href={reportPath(report.serviceName, report.taskId)}
                              target="_blank"
                            >
                              <Eye className="h-4 w-4" />
                              View
                            </Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openResendDialog(report)}
                            className="gap-2"
                          >
                            <Mail className="h-4 w-4" />
                            Resend
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Email dialog (single resend or bulk) with optional alternate recipients */}
      <Dialog
        open={emailDialogOpen}
        onOpenChange={(open) => {
          setEmailDialogOpen(open)
          if (!open) setSingleReport(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{singleReport ? 'Resend Report' : 'Email Reports'}</DialogTitle>
            <DialogDescription>
              {singleReport
                ? `Resend report ${singleReport.referenceNumber} to its recipients, or to an alternate email address.`
                : `Send ${selectedIds.size} selected report${selectedIds.size === 1 ? '' : 's'} to their recipients, or to an alternate email address.`}
            </DialogDescription>
          </DialogHeader>

          {bulkResult ? (
            <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
              <CheckCircle className="h-10 w-10 text-green-600" />
              <p className="font-medium">
                {bulkResult.sent} sent
                {bulkResult.failed > 0 ? `, ${bulkResult.failed} failed` : ''}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <RadioGroup
                value={recipientMode}
                onValueChange={(v) => setRecipientMode(v as 'default' | 'alternate')}
              >
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="default" id="mode-default" className="mt-1" />
                  <Label htmlFor="mode-default" className="font-normal">
                    Use each report&apos;s configured recipients
                    <span className="block text-xs text-muted-foreground">
                      Sends to the client/site emails set up for each report.
                    </span>
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="alternate" id="mode-alternate" className="mt-1" />
                  <Label htmlFor="mode-alternate" className="font-normal">
                    Send to an alternate email
                    <span className="block text-xs text-muted-foreground">
                      Overrides the default recipients for all selected reports.
                    </span>
                  </Label>
                </div>
              </RadioGroup>

              {recipientMode === 'alternate' && (
                <div className="space-y-2">
                  <Label htmlFor="alt-email">Alternate recipients</Label>
                  <div className="flex gap-2">
                    <Input
                      id="alt-email"
                      type="email"
                      value={newAlternateEmail}
                      onChange={(e) => setNewAlternateEmail(e.target.value)}
                      placeholder="name@example.com"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addAlternateEmail()
                        }
                      }}
                    />
                    <Button type="button" variant="outline" onClick={addAlternateEmail}>
                      Add
                    </Button>
                  </div>
                  {alternateEmails.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {alternateEmails.map((email) => (
                        <Badge key={email} variant="secondary" className="gap-1">
                          {email}
                          <button
                            type="button"
                            onClick={() =>
                              setAlternateEmails(alternateEmails.filter((e) => e !== email))
                            }
                            aria-label={`Remove ${email}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {bulkResult ? (
              <Button onClick={() => setEmailDialogOpen(false)}>Close</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setEmailDialogOpen(false)} disabled={bulkSending}>
                  Cancel
                </Button>
                <Button onClick={handleBulkSend} disabled={bulkSending} className="gap-2">
                  <Mail className="h-4 w-4" />
                  {bulkSending
                    ? 'Sending...'
                    : singleReport
                    ? 'Send report'
                    : `Send ${selectedIds.size} report${selectedIds.size === 1 ? '' : 's'}`}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
