import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div data-slot="table-container" className="w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn('w-full caption-bottom border-collapse text-body', className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('[&_tr]:border-b', className)} {...props} />
}

function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn('border-b border-border transition-colors hover:bg-muted/60', className)}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-10 px-3 text-left align-middle text-label font-semibold uppercase tracking-wide text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn('px-3 py-3 align-middle text-foreground', className)}
      {...props}
    />
  )
}

/**
 * A cell that prints its column name below `md` and becomes an ordinary table cell from `md` up.
 * The label never wraps and never shrinks, so a long value (an address) wraps instead of pushing
 * the label onto two lines. Screens pass `data-label={t(column)}` on the cell.
 */
const responsiveCell =
  'flex items-baseline justify-between gap-4 py-1 before:shrink-0 before:whitespace-nowrap before:text-label before:font-semibold before:uppercase before:tracking-wide before:text-muted-foreground before:content-[attr(data-label)] md:table-cell md:py-3 md:before:content-none'

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, responsiveCell }
