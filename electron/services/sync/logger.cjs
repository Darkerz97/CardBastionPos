function truncateText(value, maxLength = 1000) {
  const text = String(value || '')
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 3)}...`
}

function stringifyPayload(payload) {
  if (payload === null || payload === undefined) return ''

  try {
    return JSON.stringify(payload)
  } catch (error) {
    return JSON.stringify({ error: 'payload_not_serializable' })
  }
}

function writeSyncLog(db, payload = {}) {
  db.prepare(`
    INSERT INTO server_sync_logs (
      level,
      scope,
      message,
      payload_json
    ) VALUES (?, ?, ?, ?)
  `).run(
    String(payload.level || 'info'),
    String(payload.scope || 'sync'),
    truncateText(payload.message || ''),
    stringifyPayload(payload.payload)
  )
}

function listSyncLogs(db, limit = 100) {
  return db.prepare(`
    SELECT
      id,
      level,
      scope,
      message,
      payload_json,
      created_at
    FROM server_sync_logs
    ORDER BY id DESC
    LIMIT ?
  `).all(Number(limit) || 100).map((row) => ({
    id: Number(row.id),
    level: String(row.level || ''),
    scope: String(row.scope || ''),
    message: String(row.message || ''),
    payload: row.payload_json ? JSON.parse(row.payload_json) : null,
    createdAt: String(row.created_at || ''),
  }))
}

module.exports = {
  writeSyncLog,
  listSyncLogs,
}
