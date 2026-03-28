const { writeSyncLog } = require('./logger.cjs')
const { getServerSyncSettings, getServerSyncSecrets, storeServerSyncAccessToken } = require('./settings-store.cjs')
const { DEFAULT_SYNC_TIMEOUT_MS, SYNC_SOURCE } = require('./constants.cjs')

function buildUrl(baseUrl, path) {
  const cleanBase = String(baseUrl || '').trim().replace(/\/+$/g, '')
  const cleanPath = String(path || '').trim().replace(/^\/+/g, '')

  if (!cleanBase) {
    throw new Error('API_BASE_URL no configurada.')
  }

  return `${cleanBase}/${cleanPath}`
}

async function requestJson(url, options = {}, timeoutMs = DEFAULT_SYNC_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number(timeoutMs || DEFAULT_SYNC_TIMEOUT_MS))

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })

    const rawText = await response.text().catch(() => '')
    let data = null

    if (rawText) {
      try {
        data = JSON.parse(rawText)
      } catch (error) {
        data = rawText
      }
    }

    if (!response.ok) {
      const message = typeof data === 'string'
        ? data
        : data?.message || data?.error || `HTTP ${response.status}`
      const error = new Error(String(message || `HTTP ${response.status}`))
      error.statusCode = response.status
      error.responseBody = data
      throw error
    }

    return data
  } finally {
    clearTimeout(timeout)
  }
}

function resolveAuthToken(data) {
  return String(
    data?.token ||
    data?.access_token ||
    data?.plainTextToken ||
    data?.data?.token ||
    data?.data?.access_token ||
    ''
  ).trim()
}

async function authenticateWithServer(db, overrides = {}) {
  const settings = {
    ...getServerSyncSettings(db),
    ...overrides,
  }
  const secrets = getServerSyncSecrets(db)
  const authPassword = String(overrides.authPassword || secrets.authPassword || '').trim()
  const authEmail = String(overrides.authEmail || settings.authEmail || '').trim()
  const deviceName = String(overrides.deviceName || settings.deviceName || '').trim()

  if (!authEmail || !authPassword) {
    throw new Error('Faltan credenciales remotas para autenticar con Laravel.')
  }

  const url = buildUrl(settings.apiBaseUrl, settings.authPath)
  const data = await requestJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-CardBastion-Source': SYNC_SOURCE,
    },
    body: JSON.stringify({
      email: authEmail,
      password: authPassword,
      device_name: deviceName,
    }),
  }, settings.timeoutMs)

  const token = resolveAuthToken(data)
  if (!token) {
    throw new Error('El login remoto no devolvio un token valido.')
  }

  storeServerSyncAccessToken(db, token, authEmail)
  writeSyncLog(db, {
    level: 'info',
    scope: 'auth',
    message: 'Sesion remota autenticada correctamente.',
    payload: {
      authEmail,
      deviceName,
    },
  })

  return {
    success: true,
    authEmail,
    deviceName,
    tokenStored: true,
  }
}

async function authorizedRequest(db, path, options = {}, attemptReauth = true) {
  const settings = getServerSyncSettings(db)
  const secrets = getServerSyncSecrets(db)
  let accessToken = String(secrets.accessToken || '').trim()

  if (!accessToken) {
    await authenticateWithServer(db)
    accessToken = String(getServerSyncSecrets(db).accessToken || '').trim()
  }

  try {
    return await requestJson(buildUrl(settings.apiBaseUrl, path), {
      ...options,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-CardBastion-Source': SYNC_SOURCE,
        ...(settings.storeId ? { 'X-CardBastion-Store': settings.storeId } : {}),
        ...(options.headers || {}),
        Authorization: `Bearer ${accessToken}`,
      },
    }, settings.timeoutMs)
  } catch (error) {
    if (attemptReauth && Number(error?.statusCode || 0) === 401) {
      await authenticateWithServer(db)
      return authorizedRequest(db, path, options, false)
    }

    throw error
  }
}

async function postSyncPayload(db, path, payload = {}) {
  const settings = getServerSyncSettings(db)
  const body = {
    ...(settings.storeId ? { store_id: settings.storeId } : {}),
    device_code: settings.deviceName,
    ...payload,
  }

  return authorizedRequest(db, path, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function appendFormValue(params, key, value) {
  if (value === null || value === undefined) {
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      appendFormValue(params, `${key}[${index}]`, item)
    })
    return
  }

  if (typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) {
      appendFormValue(params, `${key}[${childKey}]`, childValue)
    }
    return
  }

  params.append(key, String(value))
}

async function postSyncFormPayload(db, path, payload = {}) {
  const settings = getServerSyncSettings(db)
  const params = new URLSearchParams()
  const body = {
    ...(settings.storeId ? { store_id: settings.storeId } : {}),
    device_code: settings.deviceName,
    ...payload,
  }

  for (const [key, value] of Object.entries(body)) {
    appendFormValue(params, key, value)
  }

  return authorizedRequest(db, path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: params.toString(),
  })
}

async function getSyncResource(db, path, query = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query || {})) {
    if (value === null || value === undefined || value === '') continue
    params.set(key, String(value))
  }

  const finalPath = params.toString()
    ? `${String(path || '').replace(/^\/+/g, '')}?${params.toString()}`
    : path

  return authorizedRequest(db, finalPath, {
    method: 'GET',
  })
}

module.exports = {
  authenticateWithServer,
  authorizedRequest,
  postSyncFormPayload,
  postSyncPayload,
  getSyncResource,
}
