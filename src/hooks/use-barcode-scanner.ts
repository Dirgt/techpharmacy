import { useEffect, useRef } from 'react'

export function useBarcodeScanner(onScan: (barcode: string) => void) {
  const buffer = useRef<string>('')
  const timeout = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field directly, unless it's a generic scan
      // For barcode scanners, they type very fast.
      // If the target is an input, we might want to skip, but sometimes scanners focus inputs.
      // We will capture anyway if it's very fast.

      if (e.key === 'Enter') {
        if (buffer.current.length > 3) {
          // It's likely a barcode scan
          onScan(buffer.current)
          buffer.current = ''
          e.preventDefault()
        }
      } else if (e.key.length === 1) { // Normal printable characters
        buffer.current += e.key
        
        if (timeout.current) clearTimeout(timeout.current)
        
        // Reset buffer if typing is too slow (human typing vs scanner)
        // Barcode scanners usually type characters within 10-20ms of each other.
        timeout.current = setTimeout(() => {
          buffer.current = ''
        }, 50)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (timeout.current) clearTimeout(timeout.current)
    }
  }, [onScan])
}
