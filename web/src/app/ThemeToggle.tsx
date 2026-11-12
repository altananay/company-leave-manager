import { Monitor, Moon, Sun } from 'lucide-react'

import { useI18n } from '@/i18n/I18nProvider'
import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { useTheme, type Theme } from './ThemeProvider'

const ICON = { light: Sun, dark: Moon, system: Monitor } as const

/**
 * One 44 px icon button and a three-option menu (spec 0007 D-4). A segmented group of three would
 * not fit the header at 360 px next to the language switch.
 */
export function ThemeToggle() {
  const { t } = useI18n()
  const { theme, resolved, setTheme } = useTheme()
  const Icon = theme === 'system' ? ICON.system : ICON[resolved]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={t('themeLabel')}>
          <Icon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{t('themeLabel')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
          <DropdownMenuRadioItem value="light">{t('themeLight')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">{t('themeDark')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">{t('themeSystem')}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
