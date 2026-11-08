import { Menu } from 'lucide-react'
import { Fragment, useState, type ReactNode, type RefObject } from 'react'

import { cn } from '@/lib/utils'
import { Avatar } from '@/ui/avatar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/ui/breadcrumb'
import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/ui/sheet'

export type NavItem = {
  key: string
  label: string
  icon: ReactNode
  current: boolean
  onSelect: () => void
}

type Account = { displayName: string; email: string; roleLabel: string }

type AppShellProps = {
  appName: string
  nav: NavItem[]
  breadcrumb: string[]
  user: Account
  labels: { logout: string; menu: string; close: string; navigation: string; breadcrumb: string }
  onLogout: () => void
  languageSwitch: ReactNode
  mainRef?: RefObject<HTMLElement | null>
  children: ReactNode
}

function Navigation({
  nav,
  navLabel,
  onNavigate,
}: {
  nav: NavItem[]
  navLabel: string
  onNavigate?: () => void
}) {
  return (
    <nav aria-label={navLabel} className="flex flex-col gap-1">
      {nav.map((item) => (
        <Button
          key={item.key}
          type="button"
          variant="ghost"
          aria-current={item.current ? 'page' : undefined}
          onClick={() => {
            item.onSelect()
            onNavigate?.()
          }}
          className={cn(
            'h-auto min-h-11 w-full justify-start gap-2.5 rounded-panel px-3 py-2 text-small font-normal transition-colors',
            item.current
              ? 'bg-accent font-semibold text-accent-foreground hover:bg-accent'
              : 'text-foreground hover:bg-muted',
          )}
        >
          <span aria-hidden="true" className="text-muted-foreground [&_svg]:size-4">
            {item.icon}
          </span>
          {item.label}
        </Button>
      ))}
    </nav>
  )
}

function Brand({ appName }: { appName: string }) {
  return (
    <div className="flex items-center gap-2.5 px-1 py-1">
      <span
        aria-hidden="true"
        className="brand-action grid size-9 place-items-center rounded-panel text-small font-bold text-primary-foreground shadow-1"
      >
        İY
      </span>
      <span className="text-h2 font-semibold tracking-tight">{appName}</span>
    </div>
  )
}

function AccountCard({
  user,
  logoutLabel,
  onLogout,
}: {
  user: Account
  logoutLabel: string
  onLogout: () => void
}) {
  return (
    <div className="mt-4 flex items-center gap-2.5 rounded-panel border border-border p-2">
      <Avatar name={user.displayName} />
      <div className="min-w-0">
        <p className="truncate text-small font-semibold">{user.displayName}</p>
        <p className="truncate text-label font-medium tracking-normal text-muted-foreground">
          {user.roleLabel}
        </p>
      </div>
      <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={onLogout}>
        {logoutLabel}
      </Button>
    </div>
  )
}

function AccountMenu({
  user,
  logoutLabel,
  onLogout,
}: {
  user: Account
  logoutLabel: string
  onLogout: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-auto min-h-11 gap-2 rounded-panel px-1.5 py-1 font-normal"
        >
          <Avatar name={user.displayName} />
          <span className="hidden text-small font-medium sm:block">{user.displayName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{user.roleLabel}</DropdownMenuLabel>
        <p className="px-2.5 pb-1.5 text-small text-muted-foreground">{user.email}</p>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLogout}>{logoutLabel}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The frame every signed-in screen lives in (AC-11): a persistent sidebar from 1024 px up, a sheet
 * below it, a breadcrumb and the account menu on top. Navigation items are real buttons with
 * `aria-current`, so the keyboard and a screen reader see what a mouse user sees.
 */
function AppShell({
  appName,
  nav,
  breadcrumb,
  user,
  labels,
  onLogout,
  languageSwitch,
  mainRef,
  children,
}: AppShellProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-card px-3 py-4 lg:flex">
        <Brand appName={appName} />
        <div className="mt-6 flex-1">
          <Navigation nav={nav} navLabel={labels.navigation} />
        </div>
        <AccountCard user={user} logoutLabel={labels.logout} onLogout={onLogout} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/85 px-4 backdrop-blur-sm sm:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={labels.menu}
                className="lg:hidden"
              >
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent closeLabel={labels.close} className="gap-6">
              <SheetTitle className="sr-only">{appName}</SheetTitle>
              <SheetDescription className="sr-only">{labels.menu}</SheetDescription>
              <Brand appName={appName} />
              <Navigation
                nav={nav}
                navLabel={labels.navigation}
                onNavigate={() => setOpen(false)}
              />
              <div className="mt-auto">
                <AccountCard user={user} logoutLabel={labels.logout} onLogout={onLogout} />
              </div>
            </SheetContent>
          </Sheet>

          <Breadcrumb label={labels.breadcrumb}>
            <BreadcrumbList>
              {breadcrumb.map((crumb, index) => {
                const last = index === breadcrumb.length - 1
                return (
                  <Fragment key={crumb}>
                    <BreadcrumbItem>
                      {last ? (
                        <BreadcrumbPage>{crumb}</BreadcrumbPage>
                      ) : (
                        <span className="text-muted-foreground">{crumb}</span>
                      )}
                    </BreadcrumbItem>
                    {last ? null : <BreadcrumbSeparator />}
                  </Fragment>
                )
              })}
            </BreadcrumbList>
          </Breadcrumb>

          <div className="ml-auto flex items-center gap-2">
            {languageSwitch}
            <div className="hidden lg:block">
              <AccountMenu user={user} logoutLabel={labels.logout} onLogout={onLogout} />
            </div>
          </div>
        </header>

        <main
          id="content"
          ref={mainRef}
          tabIndex={-1}
          className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8"
        >
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  )
}

export { AppShell }
