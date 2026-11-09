import { useId, type ComponentProps, type ReactNode, type Ref } from 'react'

import { cn } from '@/lib/utils'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'

/**
 * A labelled form field. `invalid` marks the field for assistive technology and `describedBy`
 * points at the message the screen shows once, in an Alert, so the text is not repeated twice.
 * Both wire `aria-invalid` / `aria-describedby` (AC-3).
 */
function Field({
  label,
  invalid,
  describedBy,
  className,
  id,
  inputRef,
  ...props
}: ComponentProps<'input'> & {
  label: ReactNode
  invalid?: boolean
  describedBy?: string
  inputRef?: Ref<HTMLInputElement>
}) {
  const generated = useId()
  const inputId = id ?? generated

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        ref={inputRef}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(className)}
        {...props}
      />
    </div>
  )
}

export { Field }
