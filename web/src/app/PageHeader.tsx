import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** Every screen starts the same way: what this is, what it is for, and the one action that matters. */
function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-4 pb-6 sm:flex-row sm:items-end', className)}>
      <div className="min-w-0">
        <h1 className="text-h1 font-semibold">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-prose text-small text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 sm:ml-auto">{actions}</div> : null}
    </div>
  )
}

export { PageHeader }
