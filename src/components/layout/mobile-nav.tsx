'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Sidebar } from '@/components/layout/sidebar'

export function MobileNav({
  role,
  drogueriaNombre,
  hasActiveTenant,
}: {
  role?: string | null
  drogueriaNombre?: string | null
  hasActiveTenant?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-10 w-10 rounded-xl text-slate-700 hover:bg-slate-100"
          aria-label="Abrir menú de navegación"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0 w-64 border-r-0">
        <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
        <Sidebar
          role={role}
          drogueriaNombre={drogueriaNombre}
          hasActiveTenant={hasActiveTenant}
          onNavigate={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  )
}
