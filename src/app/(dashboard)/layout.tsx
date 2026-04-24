import { Sidebar } from '@/components/layout/sidebar'
import { Toaster } from '@/components/ui/sonner'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex flex-shrink-0 border-r border-border">
        <Sidebar />
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 border-b border-border bg-white/50 backdrop-blur-md flex items-center px-8 z-20">
          <div className="flex-1" />
          <div className="flex items-center gap-4">
            {/* Perfil / Info de usuario */}
          </div>
        </header>

        <main className="flex-1 relative overflow-y-auto focus:outline-none p-8 bg-slate-50/50">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
      <Toaster position="top-right" richColors theme="light" />
    </div>
  )
}
