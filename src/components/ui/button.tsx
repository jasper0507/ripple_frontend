import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm leading-5 font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:bg-hover disabled:text-muted disabled:border-line [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        destructive: 'bg-danger text-white hover:bg-danger/90',
        outline:
          'border border-control-border bg-surface text-foreground hover:bg-hover',
        ghost: 'text-muted hover:bg-hover hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'px-4 py-3',
        sm: 'gap-1.5 px-3 py-2',
        lg: 'min-h-12 px-6 py-3',
        icon: 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
