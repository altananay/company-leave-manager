import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

const Select = SelectPrimitive.Root
const SelectValue = SelectPrimitive.Value

function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        // The 16 px mobile control size avoids the iOS focus zoom; from md the trigger takes the
        // scale step.
        'flex h-11 w-full items-center justify-between gap-2 rounded-control border border-control bg-card px-3 py-2 text-base shadow-1 md:text-body', // tokens-allow: iOS zoom guard (16 px on mobile)

        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-4 opacity-60" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position="popper"
        className={cn(
          'z-50 min-w-[8rem] overflow-hidden rounded-control border border-control bg-card text-card-foreground shadow-2',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'relative flex min-h-11 w-full cursor-default select-none items-center gap-2 rounded-chip py-2 pl-8 pr-2 text-body',
        // Radix keeps focus on the trigger and highlights the active row with data-highlighted, so
        // the indicator hangs off that attribute: an outline in the ring colour (AC-3).
        'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
        // Explicit outline: Tailwind's ring utilities depend on custom properties that Chromium
        // does not initialise here, and the indicator must be visible, not merely styled.
        'data-[highlighted]:[outline:2px_solid_var(--ring)] data-[highlighted]:[outline-offset:-2px]',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
