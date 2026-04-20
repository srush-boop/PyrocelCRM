'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Calendar } from '@/components/ui/calendar'
import { Mail, AlertCircle, CheckCircle, Search, Filter, CalendarIcon, X } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

interface TaskReport {
  id: string
  taskId: string
  siteName: string
  siteId: string
  serviceName: string
  serviceTypeId: string
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
  const [sendingEmail, setSendingEmail] = useState<string | null>(null)

  // Filter states
  const [search, setSearch] = useState('')
  const [selectedSite, setSelectedSite] = useState<string>('all')
  const [selectedEngineer, setSelectedEngineer] = useState<string>('all')
  const [selectedServiceType, setSelectedServiceType] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined)
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined)
  const [emailStatus, setEmailStatus] = useState<string>('all')

  // Filter options
  const [sites, setSites] = useState<FilterOption[]>([])
  const [engineers, setEngineers] = useState<FilterOption[]>([])
  const [serviceTypes, setServiceTypes] = useState<FilterOption[]>([])

  useEffect(() => {
    loadReports()
    loadFilterOptions()
  }, [])

  const loadFilterOptions = async () => {
    const [sitesRes, engineersRes, serviceTypesRes] = await Promise.all([
      supabase.from('sites').select('id, name').order('name'),
      supabase.from('profiles').select('id, full_name, email').eq('role', 'engineer'),
      supabase.from('service_types').select('id, name').order('name'),
    ])

    setSites(sitesRes.data?.map(s => ({ id: s.id, name: s.name })) || [])
    setEngineers(engineersRes.data?.map(e => ({ id: e.id, name: e.full_name || e.email })) || [])
    setServiceTypes(serviceTypesRes.data?.map(st => ({ id: st.id, name: st.name })) || [])
  }

  const loadReports = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('task_results')
        .select(`
          id,
          task_id,
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
              sites(id, name, contact_email),
              service_types(id, name)
            )
          )
        `)
        .order('created_at', { ascending: false })
        .limit(200)

      if (error) throw error

      const formatted = data?.map((item: any) => ({
        id: item.id,
        taskId: item.task_id,
        siteName: item.tasks?.site_services?.sites?.name || 'Unknown',
        siteId: item.tasks?.site_services?.sites?.id || '',
        serviceName: item.tasks?.site_services?.service_types?.name || 'Unknown',
        serviceTypeId: item.tasks?.site_services?.service_types?.id || '',
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
          report.siteName.toLowerCase().includes(searchLower) ||
          report.serviceName.toLowerCase().includes(searchLower) ||
          report.engineerName.toLowerCase().includes(searchLower) ||
          report.clientEmail.toLowerCase().includes(searchLower)
        if (!matchesSearch) return false
      }

      // Site filter
      if (selectedSite !== 'all' && report.siteId !== selectedSite) return false

      // Engineer filter
      if (selectedEngineer !== 'all' && report.engineerId !== selectedEngineer) return false

      // Service type filter
      if (selectedServiceType !== 'all' && report.serviceTypeId !== selectedServiceType) return false

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
  }, [reports, search, selectedSite, selectedEngineer, selectedServiceType, selectedStatus, emailStatus, dateFrom, dateTo])

  const clearFilters = () => {
    setSearch('')
    setSelectedSite('all')
    setSelectedEngineer('all')
    setSelectedServiceType('all')
    setSelectedStatus('all')
    setEmailStatus('all')
    setDateFrom(undefined)
    setDateTo(undefined)
  }

  const hasActiveFilters = search || selectedSite !== 'all' || selectedEngineer !== 'all' || 
    selectedServiceType !== 'all' || selectedStatus !== 'all' || emailStatus !== 'all' || 
    dateFrom || dateTo

  const resendEmail = async (reportId: string) => {
    try {
      setSendingEmail(reportId)
      
      const response = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskResultId: reportId }),
      })

      if (!response.ok) throw new Error('Failed to send email')

      toast.success('Email sent successfully')
      loadReports()
    } catch (error) {
      console.error('Error sending email:', error)
      toast.error('Failed to send email')
    } finally {
      setSendingEmail(null)
    }
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
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-2">
                <X className="h-4 w-4" />
                Clear Filters
              </Button>
            )}
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
                  <TableHead>Site</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Engineer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Client Email</TableHead>
                  <TableHead>Email Sent</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      Loading reports...
                    </TableCell>
                  </TableRow>
                ) : filteredReports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
                        <p className="text-muted-foreground">No reports found matching your filters</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell className="font-medium">{report.siteName}</TableCell>
                      <TableCell>{report.serviceName}</TableCell>
                      <TableCell>{report.engineerName}</TableCell>
                      <TableCell>
                        <Badge variant={report.overallStatus === 'pass' ? 'default' : 'destructive'}>
                          {report.overallStatus === 'pass' ? 'Pass' : report.overallStatus === 'fail' ? 'Fail' : 'Partial'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {report.clientEmail || '-'}
                      </TableCell>
                      <TableCell>
                        {report.emailSentAt ? (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="text-sm">
                              {new Date(report.emailSentAt).toLocaleDateString()}
                            </span>
                          </div>
                        ) : (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <AlertCircle className="h-4 w-4 text-yellow-600" />
                            Pending
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {report.completedAt 
                          ? new Date(report.completedAt).toLocaleDateString()
                          : new Date(report.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => resendEmail(report.id)}
                          disabled={sendingEmail === report.id}
                          className="gap-2"
                        >
                          <Mail className="h-4 w-4" />
                          {sendingEmail === report.id ? 'Sending...' : 'Resend'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
