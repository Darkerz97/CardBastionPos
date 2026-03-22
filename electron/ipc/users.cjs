const { ipcMain } = require('electron')
const { getDb } = require('../database/db.cjs')
const { hashPin, requirePermission } = require('../auth/helpers.cjs')
const { setCurrentSession, clearCurrentSession, getCurrentSession } = require('../auth/session.cjs')
const { getWindowDefinitions } = require('../auth/permissions.cjs')
const { logAudit } = require('../audit.cjs')

function mapPermissions(rows = []) {
  return rows.reduce((acc, row) => {
    acc[String(row.view_key || '')] = Boolean(row.can_access)
    return acc
  }, {})
}

function getUserPermissions(db, userId) {
  const rows = db.prepare(`
    SELECT view_key, can_access
    FROM user_window_permissions
    WHERE user_id = ?
  `).all(Number(userId))

  return mapPermissions(rows)
}

function getSessionPayload(db, userRow) {
  if (!userRow) return null

  return {
    user: {
      id: Number(userRow.id),
      username: String(userRow.username || ''),
      displayName: String(userRow.display_name || ''),
      isAdmin: Number(userRow.is_admin || 0) === 1,
    },
    permissions: getUserPermissions(db, userRow.id),
  }
}

function sanitizeUser(row, permissions) {
  return {
    id: Number(row.id),
    username: String(row.username || ''),
    displayName: String(row.display_name || ''),
    isAdmin: Number(row.is_admin || 0) === 1,
    active: Number(row.active || 0) === 1,
    createdAt: String(row.created_at || ''),
    permissions,
  }
}

function replacePermissions(db, userId, permissions = {}) {
  const definitions = getWindowDefinitions()
  const insert = db.prepare(`
    INSERT OR REPLACE INTO user_window_permissions (
      user_id,
      view_key,
      can_access
    ) VALUES (?, ?, ?)
  `)

  for (const definition of definitions) {
    insert.run(Number(userId), definition.key, permissions[definition.key] ? 1 : 0)
  }
}

function registerUserHandlers() {
  ipcMain.handle('auth:listUsers', () => {
    const db = getDb()
    return db.prepare(`
      SELECT id, username, display_name
      FROM users
      WHERE active = 1
      ORDER BY display_name ASC, username ASC
    `).all().map((row) => ({
      id: Number(row.id),
      username: String(row.username || ''),
      displayName: String(row.display_name || ''),
    }))
  })

  ipcMain.handle('auth:login', (event, payload) => {
    const db = getDb()
    const username = String(payload?.username || '').trim()
    const pin = String(payload?.pin || '').trim()

    if (!username || !pin) {
      throw new Error('Captura usuario y NIP.')
    }

    const user = db.prepare(`
      SELECT id, username, display_name, pin_hash, is_admin, active
      FROM users
      WHERE username = ?
      LIMIT 1
    `).get(username)

    if (!user || Number(user.active || 0) !== 1) {
      throw new Error('Usuario no disponible.')
    }

    if (String(user.pin_hash || '') !== hashPin(pin)) {
      throw new Error('NIP incorrecto.')
    }

    const session = getSessionPayload(db, user)
    setCurrentSession(session)

    return session
  })

  ipcMain.handle('auth:logout', () => {
    clearCurrentSession()
    return { success: true }
  })

  ipcMain.handle('auth:getSession', () => {
    const session = getCurrentSession()
    return session || null
  })

  ipcMain.handle('users:getWindowDefinitions', () => {
    return getWindowDefinitions()
  })

  ipcMain.handle('users:list', () => {
    const db = getDb()
    requirePermission('users', 'administrar usuarios')

    const rows = db.prepare(`
      SELECT id, username, display_name, is_admin, active, created_at
      FROM users
      ORDER BY active DESC, display_name ASC, username ASC
    `).all()

    return rows.map((row) => sanitizeUser(row, getUserPermissions(db, row.id)))
  })

  ipcMain.handle('users:create', (event, payload) => {
    const db = getDb()
    const session = requirePermission('users', 'crear usuarios')
    const username = String(payload?.username || '').trim().toLowerCase()
    const displayName = String(payload?.displayName || '').trim()
    const pin = String(payload?.pin || '').trim()
    const isAdmin = payload?.isAdmin ? 1 : 0
    const permissions = payload?.permissions || {}

    if (!username || !displayName || !pin) {
      throw new Error('Usuario, nombre y NIP son obligatorios.')
    }

    const result = db.prepare(`
      INSERT INTO users (
        username,
        display_name,
        pin_hash,
        is_admin,
        active,
        updated_at
      ) VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
    `).run(username, displayName, hashPin(pin), isAdmin)

    const userId = Number(result.lastInsertRowid)
    replacePermissions(db, userId, permissions)

    logAudit(db, {
      userId: session.user.id,
      username: session.user.username,
      displayName: session.user.displayName,
      entityType: 'user',
      entityId: userId,
      action: 'create',
      description: `Usuario ${username} creado`,
      payloadJson: { permissions, isAdmin: Boolean(isAdmin) },
    })

    return { success: true, id: userId }
  })

  ipcMain.handle('users:update', (event, payload) => {
    const db = getDb()
    const session = requirePermission('users', 'editar usuarios')
    const userId = Number(payload?.id || 0)

    if (!userId) {
      throw new Error('Usuario invalido.')
    }

    const current = db.prepare(`
      SELECT id, username
      FROM users
      WHERE id = ?
      LIMIT 1
    `).get(userId)

    if (!current) {
      throw new Error('Usuario no encontrado.')
    }

    const username = String(payload?.username || current.username || '').trim().toLowerCase()
    const displayName = String(payload?.displayName || '').trim()
    const pin = String(payload?.pin || '').trim()
    const isAdmin = payload?.isAdmin ? 1 : 0
    const active = payload?.active === false ? 0 : 1
    const permissions = payload?.permissions || {}

    if (!username || !displayName) {
      throw new Error('Usuario y nombre son obligatorios.')
    }

    if (pin) {
      db.prepare(`
        UPDATE users
        SET
          username = ?,
          display_name = ?,
          pin_hash = ?,
          is_admin = ?,
          active = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(username, displayName, hashPin(pin), isAdmin, active, userId)
    } else {
      db.prepare(`
        UPDATE users
        SET
          username = ?,
          display_name = ?,
          is_admin = ?,
          active = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(username, displayName, isAdmin, active, userId)
    }

    replacePermissions(db, userId, permissions)

    logAudit(db, {
      userId: session.user.id,
      username: session.user.username,
      displayName: session.user.displayName,
      entityType: 'user',
      entityId: userId,
      action: 'update',
      description: `Usuario ${username} actualizado`,
      payloadJson: { permissions, isAdmin: Boolean(isAdmin), active: Boolean(active), pinChanged: Boolean(pin) },
    })

    const activeSession = getCurrentSession()
    if (Number(activeSession?.user?.id || 0) === userId) {
      const updatedUser = db.prepare(`
        SELECT id, username, display_name, is_admin
        FROM users
        WHERE id = ?
        LIMIT 1
      `).get(userId)
      setCurrentSession(getSessionPayload(db, updatedUser))
    }

    return { success: true, id: userId }
  })

  ipcMain.handle('audit:list', () => {
    const db = getDb()
    requirePermission('users', 'consultar bitacora')

    return db.prepare(`
      SELECT
        id,
        username,
        display_name,
        entity_type,
        entity_id,
        action,
        description,
        payload_json,
        created_at
      FROM audit_logs
      ORDER BY id DESC
      LIMIT 300
    `).all().map((row) => ({
      id: Number(row.id),
      username: String(row.username || ''),
      displayName: String(row.display_name || ''),
      entityType: String(row.entity_type || ''),
      entityId: row.entity_id ? Number(row.entity_id) : null,
      action: String(row.action || ''),
      description: String(row.description || ''),
      payload: row.payload_json ? JSON.parse(row.payload_json) : null,
      createdAt: String(row.created_at || ''),
    }))
  })
}

module.exports = {
  registerUserHandlers,
  getUserPermissions,
}
