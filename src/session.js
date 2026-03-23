import { reactive } from 'vue'

export const sessionState = reactive({
  ready: false,
  user: null,
  permissions: {},
})

export async function refreshSession() {
  const session = await window.posAPI.getCurrentSession()
  sessionState.ready = true
  sessionState.user = session?.user || null
  sessionState.permissions = session?.permissions || {}
  return sessionState.user
}

export function clearSessionState() {
  sessionState.ready = true
  sessionState.user = null
  sessionState.permissions = {}
}

export function hasWindowAccess(permissionKey) {
  if (!sessionState.user) return false
  if (sessionState.user.isAdmin) return true
  return Boolean(sessionState.permissions?.[permissionKey])
}

export function getFirstAllowedRoute() {
  const order = [
    { name: 'pos', path: '/' },
    { name: 'history', path: '/history' },
    { name: 'cash', path: '/cash' },
    { name: 'products', path: '/products' },
    { name: 'customers', path: '/customers' },
    { name: 'customer-history', path: '/customers/history' },
    { name: 'receivables', path: '/receivables' },
    { name: 'preorders', path: '/preorders' },
    { name: 'tournaments', path: '/tournaments' },
    { name: 'reports', path: '/reports' },
    { name: 'settings', path: '/settings' },
    { name: 'backup', path: '/backup' },
    { name: 'users', path: '/users' },
  ]

  const firstAllowed = order.find((route) => hasWindowAccess(route.name))
  return firstAllowed?.path || '/'
}
