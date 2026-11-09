import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * A menu is a popup, not a dialog: non-modal, so the page behind it keeps its place in the
 * accessibility tree. Radix's default is modal, which marks every other element `aria-hidden` while
 * the menu is open — the shell's header and the sidebar then hold focusable buttons inside an
 * `aria-hidden` subtree, which is a WCAG 4.1.2 failure (axe: `aria-hidden-focus`) and, for a screen
 * reader user, loses the whole page to a two-item menu. The keyboard still belongs to the menu:
 * focus moves to the first item, the arrow keys move it, Escape closes it and returns focus.
 */
function DropdownMenu({
  modal = false,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root modal={modal} {...props} />
}

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

/** Row actions live behind one button instead of three, so the table stays quiet (AC-14). */
function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = 'end',
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-50 min-w-[11rem] overflow-hidden rounded-panel border border-border bg-card p-1 text-card-foreground shadow-2',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuItem({
  className,
  variant = 'default',
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item> & { variant?: 'default' | 'destructive' }) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(
        'flex min-h-11 cursor-default select-none items-center gap-2 rounded-control px-2.5 py-2 text-small outline-none',
        'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
        'data-[highlighted]:[outline:2px_solid_var(--ring)] data-[highlighted]:[outline-offset:-2px]',
        variant === 'destructive' && 'text-destructive data-[highlighted]:bg-destructive/10',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn('px-2.5 py-1.5 text-label uppercase text-muted-foreground', className)}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
}
