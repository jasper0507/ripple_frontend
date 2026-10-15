import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'focus:outline-none form-control flex placeholder:text-muted',
        'disabled:cursor-not-allowed disabled:bg-hover disabled:text-muted',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
