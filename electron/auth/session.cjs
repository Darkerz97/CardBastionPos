let currentSession = null

function setCurrentSession(session) {
  currentSession = session ? { ...session } : null
}

function clearCurrentSession() {
  currentSession = null
}

function getCurrentSession() {
  return currentSession ? { ...currentSession } : null
}

module.exports = {
  setCurrentSession,
  clearCurrentSession,
  getCurrentSession,
}
