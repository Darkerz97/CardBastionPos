const crypto = require('crypto')
const { getCurrentSession } = require('./session.cjs')

function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin || '')).digest('hex')
}

function requireSession(action = 'realizar esta accion') {
  const session = getCurrentSession()

  if (!session?.user?.id) {
    throw new Error(`Debes iniciar sesion para ${action}.`)
  }

  return session
}

function hasPermission(session, permissionKey) {
  if (!permissionKey) return true
  if (!session?.user?.id) return false
  if (Number(session.user.isAdmin || 0) === 1) return true
  return Boolean(session.permissions?.[permissionKey])
}

function requirePermission(permissionKey, action = 'acceder a esta ventana') {
  const session = requireSession(action)

  if (!hasPermission(session, permissionKey)) {
    throw new Error(`No tienes permiso para ${action}.`)
  }

  return session
}

function getAuditActor() {
  const session = getCurrentSession()
  return {
    userId: Number(session?.user?.id || 0) || null,
    username: String(session?.user?.username || ''),
    displayName: String(session?.user?.displayName || ''),
  }
}

module.exports = {
  hashPin,
  requireSession,
  requirePermission,
  hasPermission,
  getAuditActor,
}
