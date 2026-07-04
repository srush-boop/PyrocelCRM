'use client'

import { useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { Button } from '@/components/ui/button'
import { Eraser } from 'lucide-react'

interface SignaturePadProps {
  onChange: (dataUrl: string | null) => void
  className?: string
}

export function SignaturePad({ onChange, className }: SignaturePadProps) {
  const ref = useRef<SignatureCanvas>(null)
  const [hasDrawn, setHasDrawn] = useState(false)

  const handleEnd = () => {
    const canvas = ref.current
    if (!canvas) return
    if (canvas.isEmpty()) {
      setHasDrawn(false)
      onChange(null)
      return
    }
    setHasDrawn(true)
    onChange(canvas.getTrimmedCanvas().toDataURL('image/png'))
  }

  const handleClear = () => {
    ref.current?.clear()
    setHasDrawn(false)
    onChange(null)
  }

  return (
    <div className={className}>
      <div className="relative rounded-md border bg-white">
        <SignatureCanvas
          ref={ref}
          penColor="#0f172a"
          onEnd={handleEnd}
          canvasProps={{
            className: 'h-40 w-full touch-none rounded-md',
          }}
        />
        {!hasDrawn && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Sign here
          </span>
        )}
      </div>
      <div className="mt-2 flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
          <Eraser className="mr-2 h-4 w-4" />
          Clear
        </Button>
      </div>
    </div>
  )
}
