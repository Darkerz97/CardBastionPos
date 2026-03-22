function logAudit(db, payload = {}) {
  db.prepare(`
    INSERT INTO audit_logs (
      user_id,
      username,
      display_name,
      entity_type,
      entity_id,
      action,
      description,
      payload_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    payload.userId || null,
    String(payload.username || ''),
    String(payload.displayName || ''),
    String(payload.entityType || ''),
    payload.entityId || null,
    String(payload.action || ''),
    String(payload.description || ''),
    payload.payloadJson ? JSON.stringify(payload.payloadJson) : null
  )
}

module.exports = {
  logAudit,
}
