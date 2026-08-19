'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, UserCheck } from 'lucide-react'
import { reassignCallToWorker } from '@/app/subcontractor/actions'

interface WorkerOption {
  id: string
  fullName: string | null
  email: string
}

/** Lead-only control to issue a call to one of the company's workers. */
export function ReassignWorker({
  taskId,
  workers,
  currentAssigneeId,
}: {
  taskId: string
  workers: WorkerOption[]
  currentAssigneeId: string | null
}) {
  const [selected, setSelected] = useState<string>(currentAssigneeId ?? '')
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const handleAssign = () => {
    if (!selected || selected === currentAssigneeId) return
    setMessage(null)
    startTransition(async () => {
      const result = await reassignCallToWorker(taskId, selected)
      if (result.ok) {
        setMessage({ type: 'ok', text: 'Call issued to the selected worker.' })
      } else {
        setMessage({ type: 'error', text: result.error || 'Could not issue the call.' })
      }
    })
  }

  if (workers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No workers are set up for your company yet. Contact the Pyrocel office to add workers.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="worker">Issue this call to</Label>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger id="worker">
            <SelectValue placeholder="Select a worker" />
          </SelectTrigger>
          <SelectContent>
            {workers.map((worker) => (
              <SelectItem key={worker.id} value={worker.id}>
                {worker.fullName || worker.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}
      <Button
        onClick={handleAssign}
        disabled={pending || !selected || selected === currentAssigneeId}
        className="gap-2"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Issuing...
          </>
        ) : (
          <>
            <UserCheck className="h-4 w-4" />
            Issue call
          </>
        )}
      </Button>
    </div>
  )
}
