import type { MessageKey } from '@/i18n/messages'

/** The role's catalogue key. One copy for the shell and the users screen. */
export function roleKey(role: string): MessageKey {
  switch (role) {
    case 'HR':
      return 'roleHr'
    case 'CEO':
      return 'roleCeo'
    case 'MANAGER':
      return 'roleManager'
    default:
      return 'roleEmployee'
  }
}
