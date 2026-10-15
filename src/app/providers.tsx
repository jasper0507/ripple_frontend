import { QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { createQueryClient } from '@/api/query-client'
import { SessionProvider } from './session'

export function Providers({ children }: { children: ReactNode }) {
  // QueryClient 仅存当前标签页内存
  const [queryClient] = useState(createQueryClient)
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  )
}
