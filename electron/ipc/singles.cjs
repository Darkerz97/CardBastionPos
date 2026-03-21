const { ipcMain, shell } = require('electron')
const { getDb } = require('../database/db.cjs')

function normalizeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value).trim()
}

function normalizeNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function decodeHtmlEntities(value = '') {
  return String(value)
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
}

function cleanHtmlText(value = '') {
  return decodeHtmlEntities(String(value || ''))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractFirstMatch(text, patterns = [], fallback = '') {
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern)
    if (match?.[1]) {
      return cleanHtmlText(match[1])
    }
  }

  return fallback
}

function normalizeLooseText(value = '') {
  return cleanHtmlText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function normalizeToken(value = '') {
  return normalizeLooseText(value).replace(/[^a-z0-9]+/g, '')
}

function tokenizeSearchTerms(value = '') {
  return normalizeLooseText(value)
    .split(/[^a-z0-9]+/g)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)
}

function isLikelyProductUrl(url = '') {
  const normalized = normalizeLooseText(url)
  if (!normalized) return false
  if (/rcq\.starcitygames\.com/i.test(url)) return false
  if (/\/(events|pages|blogs|account|cart|checkout)\//i.test(url)) return false
  if (/starcitygames\.com\/(?:mtg|pokemon|ygo|yugioh|fab|swu|one-piece|lorcana|universus|wotf|vibes|crb)\//i.test(url)) return true
  if (/trading-card-singles/i.test(url)) return true
  if (/\/products?\//i.test(url)) return true
  return false
}

function matchesGame(row, game = '') {
  const token = normalizeToken(game)
  if (!token) return true

  const haystack = normalizeLooseText(`${row.title || ''} ${row.url || ''}`)
  const url = normalizeLooseText(row.url || '')

  if (token === 'magicthegathering' || token === 'mtg' || token === 'magic') {
    return /starcitygames\.com\/mtg\//i.test(url) || /magic/i.test(haystack)
  }

  if (token === 'pokemon') return /starcitygames\.com\/pokemon\//i.test(url) || /pokemon/i.test(haystack)
  if (token === 'yugioh' || token === 'ygo') return /starcitygames\.com\/(?:ygo|yugioh)\//i.test(url) || /yu-?gi-?oh/i.test(haystack)
  if (token === 'fleshandblood') return /starcitygames\.com\/fab\//i.test(url) || /flesh and blood/i.test(haystack)
  if (token === 'lorcana') return /starcitygames\.com\/lorcana\//i.test(url) || /lorcana/i.test(haystack)
  if (token === 'starwarsunlimited' || token === 'swu') return /starcitygames\.com\/swu\//i.test(url) || /star wars unlimited/i.test(haystack)
  if (token === 'onepiece') return /starcitygames\.com\/one-piece\//i.test(url) || /one piece/i.test(haystack)

  return true
}

function matchesQueryTerms(row, query = '') {
  const terms = tokenizeSearchTerms(query)
  if (!terms.length) return true

  const title = normalizeLooseText(row.title || '')
  const url = normalizeLooseText(row.url || '')
  const haystack = `${title} ${url}`

  const matched = terms.filter((term) => haystack.includes(term))
  return matched.length >= Math.min(2, terms.length)
}

function getSynonymsForFilter(type, rawValue = '') {
  const text = normalizeLooseText(rawValue)
  const token = normalizeToken(rawValue)
  const values = new Set()

  if (text) values.add(text)
  if (token) values.add(token)

  if (type === 'finish') {
    if (token === 'nonfoil' || token === 'nonfoil') {
      values.add('non foil')
      values.add('nonfoil')
      values.add('regular')
      values.add('normal')
    }
    if (token === 'foil') {
      values.add('traditional foil')
      values.add('foil')
    }
  }

  if (type === 'language') {
    if (['en', 'eng', 'english', 'ingles'].includes(token)) {
      values.add('en')
      values.add('english')
      values.add('ingles')
    }
    if (['es', 'spa', 'spanish', 'espanol'].includes(token)) {
      values.add('es')
      values.add('spanish')
      values.add('espanol')
    }
  }

  if (type === 'condition') {
    if (token === 'nm' || token === 'nearmint') {
      values.add('nm')
      values.add('near mint')
      values.add('nearmint')
    }
    if (token === 'lp' || token === 'lightplayed') {
      values.add('lp')
      values.add('light played')
    }
    if (token === 'mp' || token === 'moderatelyplayed') {
      values.add('mp')
      values.add('moderately played')
    }
  }

  if (type === 'setName') {
    if (token === 'magic2010') {
      values.add('magic 2010')
      values.add('m10')
      values.add('2010')
    }
  }

  return Array.from(values).filter(Boolean)
}

function matchesFilter(text, type, value) {
  const haystack = normalizeLooseText(text)
  const compactHaystack = haystack.replace(/[^a-z0-9]+/g, '')
  const synonyms = getSynonymsForFilter(type, value)

  if (!synonyms.length) return true

  return synonyms.some((term) => {
    const normalizedTerm = normalizeLooseText(term)
    const compactTerm = normalizeToken(term)
    return (normalizedTerm && haystack.includes(normalizedTerm)) || (compactTerm && compactHaystack.includes(compactTerm))
  })
}

function scoreSearchResult(row, filters = {}) {
  const text = normalizeLooseText(`${row.title} ${row.url}`)
  let score = 0

  if (filters.query && matchesQueryTerms(row, filters.query)) score += 10
  if (isLikelyProductUrl(row.url)) score += 4
  if (filters.setName && matchesFilter(text, 'setName', filters.setName)) score += 4
  if (filters.finish && matchesFilter(text, 'finish', filters.finish)) score += 3
  if (filters.language && matchesFilter(text, 'language', filters.language)) score += 2
  if (filters.condition && matchesFilter(text, 'condition', filters.condition)) score += 2

  return score
}

function normalizeStarCityUrl(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''

  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://starcitygames.com${raw}`)
    url.hash = ''
    return url.toString()
  } catch (error) {
    return ''
  }
}

function roundByMode(value, mode = 'none') {
  const n = Number(value || 0)
  if (mode === 'nearest_1') return Math.round(n)
  if (mode === 'nearest_5') return Math.round(n / 5) * 5
  if (mode === 'nearest_10') return Math.round(n / 10) * 10
  if (mode === 'ceil_1') return Math.ceil(n)
  if (mode === 'ceil_5') return Math.ceil(n / 5) * 5
  return Number(n.toFixed(2))
}

function mapConditionLabelToCode(value = '') {
  const token = normalizeToken(value)
  if (token === 'nearmint') return 'NM'
  if (token === 'lightplayed' || token === 'played') return 'LP'
  if (token === 'moderatelyplayed') return 'MP'
  if (token === 'heavilyplayed') return 'HP'
  if (token === 'damaged') return 'DMG'
  return normalizeText(value).toUpperCase()
}

function extractMetadataFromStarCityPage(html, targetUrl = '') {
  const pageTitle = extractFirstMatch(html, [
    /<title[^>]*>([\s\S]*?)<\/title>/i,
  ])
  const heading = extractFirstMatch(html, [
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
  ])
  const subheading = extractFirstMatch(html, [
    /<h2[^>]*>([\s\S]*?)<\/h2>/i,
    /<div[^>]*class="[^"]*productView-subtitle[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ])

  const normalizedTitle = cleanHtmlText(pageTitle).replace(/\|\s*Star City Games.*$/i, '').trim()
  const titleParts = normalizedTitle.split('|').map((part) => cleanHtmlText(part)).filter(Boolean)
  const cardName = heading || titleParts[0] || ''

  let setName = ''
  let language = ''
  if (titleParts[1]) {
    const secondPart = titleParts[1]
    const splitByDash = secondPart.split(' - ').map((part) => cleanHtmlText(part)).filter(Boolean)
    setName = splitByDash[0] || secondPart
    language = splitByDash[1] || ''
  }

  if (!language && subheading && subheading !== cardName) {
    language = subheading
  }

  const conditionLabel = extractFirstMatch(html, [
    /Condition:\s*\(Required\)[\s\S]{0,250}?(Near Mint|Light Played|Moderately Played|Heavily Played|Played|Damaged)/i,
  ])

  const urlPath = (() => {
    try {
      return new URL(normalizeStarCityUrl(targetUrl)).pathname
    } catch (error) {
      return ''
    }
  })()

  const slug = String(urlPath || '').split('/').filter(Boolean).pop() || ''
  const slugParts = slug.split('-').map((part) => part.trim()).filter(Boolean)
  const mtgIndex = slugParts.findIndex((part) => part.toLowerCase() === 'mtg')
  const setCode = mtgIndex >= 0 && slugParts[mtgIndex + 1]
    ? String(slugParts[mtgIndex + 1] || '').toUpperCase()
    : ''
  const collectorNumber = mtgIndex >= 0 && slugParts[mtgIndex + 2]
    ? String(slugParts[mtgIndex + 2] || '')
    : ''

  const finish = /foil/i.test(`${normalizedTitle} ${slug}`) ? 'foil' : 'nonfoil'

  return {
    game: 'Magic: The Gathering',
    category: 'Singles',
    cardName: cardName || '',
    name: cardName || '',
    setName: setName || '',
    setCode,
    collectorNumber,
    finish,
    language: language ? String(language).toUpperCase().slice(0, 2) : '',
    cardCondition: mapConditionLabelToCode(conditionLabel || 'Near Mint'),
  }
}

function getMagicSinglePriceMxnFromUsd(priceUsd, exchangeRate = 18) {
  const usd = Number(priceUsd || 0)
  const rate = Number(exchangeRate || 18)
  return Number((usd * rate).toFixed(2))
}

function extractPriceFromHtml(html) {
  if (!html) return null

  const moneyPatterns = [
    /"price"\s*:\s*"?([0-9]+(?:\.[0-9]{1,2})?)"?/i,
    /"amount"\s*:\s*"?([0-9]+(?:\.[0-9]{1,2})?)"?/i,
    /"salePrice"\s*:\s*"?([0-9]+(?:\.[0-9]{1,2})?)"?/i,
    /"priceAmount"\s*:\s*"?([0-9]+(?:\.[0-9]{1,2})?)"?/i,
    /"offers"\s*:\s*\{[\s\S]{0,300}?"price"\s*:\s*"?([0-9]+(?:\.[0-9]{1,2})?)"?/i,
    /\$\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    /data-price\s*=\s*"([0-9]+(?:\.[0-9]{1,2})?)"/i,
  ]

  for (const pattern of moneyPatterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      const parsed = Number(match[1])
      if (Number.isFinite(parsed) && parsed >= 0) {
        return parsed
      }
    }
  }

  return null
}

function extractCandidatesFromHtml(html) {
  if (!html) return []

  const results = []
  const seen = new Set()
  const pushResult = (candidate = {}) => {
    const url = normalizeStarCityUrl(candidate.url)
    const title = cleanHtmlText(candidate.title || '')

    if (!url || !title || seen.has(url)) return

    seen.add(url)
    results.push({
      title: title.slice(0, 220),
      url,
      priceUsd: Number.isFinite(Number(candidate.priceUsd)) ? Number(candidate.priceUsd) : null,
    })
  }

  const anchorRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let match

  while ((match = anchorRegex.exec(html)) !== null) {
    const href = String(match[1] || '')
    const content = cleanHtmlText(match[2] || '')

    if (!href || !content) continue
    if (!href.includes('/')) continue
    if (href.startsWith('#')) continue
    if (/\/(account|cart|checkout|pages|blogs)\//i.test(href)) continue

    const possiblePriceMatch = content.match(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/)

    pushResult({
      title: content,
      url: href,
      priceUsd: possiblePriceMatch?.[1] ? Number(possiblePriceMatch[1]) : null,
    })

    if (results.length >= 50) break
  }

  const jsonProductRegex = /"url"\s*:\s*"(https?:\\?\/\\?\/starcitygames\.com\\?\/[^"]+|\\?\/[^"]+|\/[^"]+)"[\s\S]{0,400}?"name"\s*:\s*"([^"]+)"[\s\S]{0,200}?"price"\s*:\s*"?(?:USD)?\s*([0-9]+(?:\.[0-9]{1,2})?)"?/gi
  while ((match = jsonProductRegex.exec(html)) !== null) {
    pushResult({
      url: decodeHtmlEntities(String(match[1] || '').replace(/\\\//g, '/')),
      title: decodeHtmlEntities(match[2] || ''),
      priceUsd: Number(match[3]),
    })

    if (results.length >= 50) break
  }

  const looseUrlRegex = /"(\/[^"]*(?:magic|pokemon|yugioh|flesh-and-blood|lorcana|star-wars-unlimited|one-piece|universus)[^"]*)"/gi
  while ((match = looseUrlRegex.exec(html)) !== null) {
    const url = decodeHtmlEntities(String(match[1] || '').replace(/\\\//g, '/'))
    if (!/\/products?\//i.test(url) && !/trading-card-singles/i.test(url)) continue

    const slug = url.split('/').filter(Boolean).pop() || ''
    const derivedTitle = slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

    pushResult({
      url,
      title: derivedTitle,
      priceUsd: null,
    })

    if (results.length >= 50) break
  }

  return results
}

function getPricingConfig(db) {
  const rows = db.prepare(`
    SELECT key, value
    FROM settings
    WHERE key IN (
      'singles.exchange_rate',
      'singles.multiplier',
      'singles.fixed_markup',
      'singles.rounding_mode'
    )
  `).all()

  const map = new Map(rows.map((row) => [row.key, row.value]))

  return {
    exchangeRate: normalizeNumber(map.get('singles.exchange_rate'), 18),
    multiplier: normalizeNumber(map.get('singles.multiplier'), 1),
    fixedMarkup: normalizeNumber(map.get('singles.fixed_markup'), 0),
    roundingMode: normalizeText(map.get('singles.rounding_mode') || 'none', 'none'),
  }
}

function setPricingConfig(db, payload = {}) {
  const cfg = {
    exchangeRate: normalizeNumber(payload.exchangeRate, 18),
    multiplier: normalizeNumber(payload.multiplier, 1),
    fixedMarkup: normalizeNumber(payload.fixedMarkup, 0),
    roundingMode: normalizeText(payload.roundingMode || 'none', 'none'),
  }

  const upsert = db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `)

  const tx = db.transaction(() => {
    upsert.run('singles.exchange_rate', String(cfg.exchangeRate))
    upsert.run('singles.multiplier', String(cfg.multiplier))
    upsert.run('singles.fixed_markup', String(cfg.fixedMarkup))
    upsert.run('singles.rounding_mode', cfg.roundingMode)
  })

  tx()

  return cfg
}

function calculateSalePrice(product, config) {
  const usd = Number(product.starcity_price_usd || 0)
  const mode = normalizeText(product.pricing_mode || 'manual', 'manual')

  if (mode === 'manual') {
    return Number(product.price || 0)
  }

  const baseMxn = usd * Number(config.exchangeRate || 0)

  if (mode === 'starcity_direct') {
    return roundByMode(baseMxn, config.roundingMode)
  }

  const formulaType = normalizeText(product.pricing_formula_type || 'multiplier', 'multiplier')
  const formulaValue = Number(product.pricing_formula_value || 0)

  let calculated = baseMxn

  if (formulaType === 'multiplier') {
    const multiplier = formulaValue > 0 ? formulaValue : Number(config.multiplier || 1)
    calculated = baseMxn * multiplier
  } else if (formulaType === 'fixed_markup') {
    const fixed = formulaValue || Number(config.fixedMarkup || 0)
    calculated = baseMxn + fixed
  } else if (formulaType === 'multiplier_plus_fixed') {
    calculated = (baseMxn * Number(config.multiplier || 1)) + Number(config.fixedMarkup || 0)
  }

  return roundByMode(calculated, config.roundingMode)
}

function getSingleById(db, productId) {
  return db.prepare(`
    SELECT
      id,
      sku,
      barcode,
      name,
      category,
      price,
      cost,
      stock,
      COALESCE(min_stock, 0) as min_stock,
      image,
      active,
      COALESCE(product_type, 'normal') as product_type,
      COALESCE(game, '') as game,
      COALESCE(card_name, '') as card_name,
      COALESCE(set_name, '') as set_name,
      COALESCE(set_code, '') as set_code,
      COALESCE(collector_number, '') as collector_number,
      COALESCE(finish, '') as finish,
      COALESCE(language, '') as language,
      COALESCE(card_condition, '') as card_condition,
      COALESCE(scryfall_id, '') as scryfall_id,
      COALESCE(starcity_url, '') as starcity_url,
      COALESCE(starcity_variant_key, '') as starcity_variant_key,
      COALESCE(starcity_price_usd, 0) as starcity_price_usd,
      starcity_last_sync,
      COALESCE(pricing_mode, 'manual') as pricing_mode,
      COALESCE(pricing_formula_type, '') as pricing_formula_type,
      COALESCE(pricing_formula_value, 0) as pricing_formula_value,
      created_at,
      updated_at
    FROM products
    WHERE id = ?
      AND COALESCE(product_type, 'normal') = 'single'
    LIMIT 1
  `).get(Number(productId))
}

async function fetchStarCitySearch(query) {
  const encoded = encodeURIComponent(query)
  const candidates = [
    `https://starcitygames.com/search?q=${encoded}&type=product`,
    `https://starcitygames.com/search?type=product&q=${encoded}`,
    `https://starcitygames.com/search/?search_query=${encoded}`,
    `https://starcitygames.com/search.php?search_query=${encoded}`,
  ]

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': 'Mozilla/5.0 CardBastionPOS/1.0',
          accept: 'text/html,application/xhtml+xml',
        },
      })

      if (!response.ok) continue

      const html = await response.text()
      const parsed = extractCandidatesFromHtml(html)

      if (parsed.length) {
        return {
          sourceUrl: url,
          results: parsed,
        }
      }
    } catch (error) {
      // Intento siguiente endpoint
    }
  }

  return {
    sourceUrl: '',
    results: [],
  }
}

function extractSearchEngineCandidates(html) {
  if (!html) return []

  const results = []
  const seen = new Set()
  const anchorRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let match

  while ((match = anchorRegex.exec(html)) !== null) {
    const href = decodeHtmlEntities(String(match[1] || ''))
    const title = cleanHtmlText(match[2] || '')

    if (!href || !title) continue

    let url = href
    if (href.startsWith('//')) {
      url = `https:${href}`
    }

    if (/^\/l\/\?kh=-1&uddg=/i.test(url)) {
      const encodedTarget = url.split('uddg=')[1] || ''
      try {
        url = decodeURIComponent(encodedTarget)
      } catch (error) {
        continue
      }
    }

    url = normalizeStarCityUrl(url)
    if (!url || seen.has(url)) continue
    if (!/starcitygames\.com/i.test(url)) continue
    if (!isLikelyProductUrl(url)) continue

    seen.add(url)
    results.push({
      title,
      url,
      priceUsd: null,
    })

    if (results.length >= 25) break
  }

  return results
}

async function fetchSearchEngineStarCityResults(query, game = 'Magic: The Gathering') {
  const searchQueries = [
    `site:starcitygames.com "${query}" "${game}"`,
    `site:starcitygames.com "${query}" Star City Games`,
  ]

  for (const rawQuery of searchQueries) {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(rawQuery)}`

    try {
      const response = await fetch(url, {
        headers: {
          'user-agent': 'Mozilla/5.0 CardBastionPOS/1.0',
          accept: 'text/html,application/xhtml+xml',
        },
      })

      if (!response.ok) continue

      const html = await response.text()
      const parsed = extractSearchEngineCandidates(html)

      if (parsed.length) {
        return {
          sourceUrl: url,
          results: parsed,
        }
      }
    } catch (error) {
      // Intento siguiente query
    }
  }

  return {
    sourceUrl: '',
    results: [],
  }
}

async function refreshSingleStarCityPrice(db, payload = {}) {
  const productId = Number(payload.productId || 0)

  if (!productId) {
    throw new Error('productId invalido.')
  }

  const product = getSingleById(db, productId)

  if (!product) {
    throw new Error('Single no encontrado.')
  }

  let targetUrl = normalizeText(payload.sourceUrl || payload.starcity_url || product.starcity_url)
  const variantKey = normalizeText(payload.variantKey || payload.starcity_variant_key || product.starcity_variant_key)
  let detectedPrice = normalizeNumber(payload.priceUsd, NaN)
  let rawPayload = payload.rawPayload ? JSON.stringify(payload.rawPayload) : null

  if (!Number.isFinite(detectedPrice)) {
    if (!targetUrl) {
      throw new Error('El single no tiene URL de Star City vinculada.')
    }

    const response = await fetch(targetUrl, {
      headers: {
        'user-agent': 'Mozilla/5.0 CardBastionPOS/1.0',
        accept: 'text/html,application/xhtml+xml',
      },
    })

    if (!response.ok) {
      throw new Error(`No se pudo consultar Star City (${response.status}).`)
    }

    const html = await response.text()
    detectedPrice = extractPriceFromHtml(html)
    rawPayload = rawPayload || JSON.stringify({ scraped: true, length: html.length })

    if (!Number.isFinite(detectedPrice)) {
      throw new Error('No se pudo detectar precio en la pagina de Star City.')
    }
  }

  const insertMarket = db.prepare(`
    INSERT INTO single_market_prices (
      product_id,
      source,
      source_url,
      source_variant_key,
      currency,
      price,
      raw_payload,
      last_checked_at
    ) VALUES (?, 'starcity', ?, ?, 'USD', ?, ?, CURRENT_TIMESTAMP)
  `)

  const updateProduct = db.prepare(`
    UPDATE products
    SET
      starcity_url = ?,
      starcity_variant_key = ?,
      starcity_price_usd = ?,
      starcity_last_sync = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `)

  const tx = db.transaction(() => {
    let nextPriceMxn = Number(product.price || 0)
    if (normalizeToken(product.game) === 'magicthegathering') {
      nextPriceMxn = getMagicSinglePriceMxnFromUsd(detectedPrice, 18)
      db.prepare(`
        UPDATE products
        SET price = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(nextPriceMxn, productId)
    }

    updateProduct.run(targetUrl, variantKey, Number(detectedPrice || 0), productId)
    insertMarket.run(productId, targetUrl, variantKey, Number(detectedPrice || 0), rawPayload)
  })

  tx()

  return getSingleById(db, productId)
}

async function fetchStarCityPriceFromUrl(targetUrl) {
  const normalizedUrl = normalizeStarCityUrl(targetUrl)

  if (!normalizedUrl) {
    throw new Error('La URL de Star City no es valida.')
  }

  const response = await fetch(normalizedUrl, {
    headers: {
      'user-agent': 'Mozilla/5.0 CardBastionPOS/1.0',
      accept: 'text/html,application/xhtml+xml',
    },
  })

  if (!response.ok) {
    throw new Error(`No se pudo consultar Star City (${response.status}).`)
  }

  const html = await response.text()
  const priceUsd = extractPriceFromHtml(html)

  if (!Number.isFinite(priceUsd)) {
    throw new Error('No se pudo detectar precio en la pagina de Star City.')
  }

  return {
    url: normalizedUrl,
    priceUsd: Number(priceUsd || 0),
    priceMxn: getMagicSinglePriceMxnFromUsd(priceUsd, 18),
    metadata: extractMetadataFromStarCityPage(html, normalizedUrl),
    rawPayload: {
      scraped: true,
      length: html.length,
    },
  }
}

function registerSinglesHandlers() {
  ipcMain.handle('singles:list', (event, filters = {}) => {
    const db = getDb()
    const includeInactive = Boolean(filters?.includeInactive)
    const where = [`COALESCE(product_type, 'normal') = 'single'`]
    const params = []

    if (!includeInactive) {
      where.push('active = 1')
    }

    if (filters?.withoutLink) {
      where.push(`(starcity_url IS NULL OR trim(starcity_url) = '')`)
    }

    if (filters?.outdatedDays) {
      where.push(`(
        starcity_last_sync IS NULL OR
        datetime(starcity_last_sync) <= datetime('now', ?)
      )`)
      params.push(`-${Number(filters.outdatedDays || 0)} days`)
    }

    const query = normalizeText(filters?.query).toLowerCase()
    if (query) {
      where.push(`(
        lower(name) LIKE ? OR
        lower(card_name) LIKE ? OR
        lower(set_name) LIKE ? OR
        lower(set_code) LIKE ?
      )`)
      params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`)
    }

    return db.prepare(`
      SELECT
        id,
        sku,
        barcode,
        name,
        category,
        price,
        cost,
        stock,
        COALESCE(min_stock, 0) as min_stock,
        image,
        active,
        COALESCE(product_type, 'normal') as product_type,
        COALESCE(game, '') as game,
        COALESCE(card_name, '') as card_name,
        COALESCE(set_name, '') as set_name,
        COALESCE(set_code, '') as set_code,
        COALESCE(collector_number, '') as collector_number,
        COALESCE(finish, '') as finish,
        COALESCE(language, '') as language,
        COALESCE(card_condition, '') as card_condition,
        COALESCE(scryfall_id, '') as scryfall_id,
        COALESCE(starcity_url, '') as starcity_url,
        COALESCE(starcity_variant_key, '') as starcity_variant_key,
        COALESCE(starcity_price_usd, 0) as starcity_price_usd,
        starcity_last_sync,
        COALESCE(pricing_mode, 'manual') as pricing_mode,
        COALESCE(pricing_formula_type, '') as pricing_formula_type,
        COALESCE(pricing_formula_value, 0) as pricing_formula_value,
        created_at,
        updated_at
      FROM products
      WHERE ${where.join(' AND ')}
      ORDER BY name ASC
    `).all(...params)
  })

  ipcMain.handle('singles:getById', (event, productId) => {
    const db = getDb()
    const single = getSingleById(db, Number(productId))

    if (!single) {
      throw new Error('Single no encontrado.')
    }

    const prices = db.prepare(`
      SELECT
        id,
        source,
        source_url,
        source_variant_key,
        currency,
        price,
        last_checked_at,
        raw_payload
      FROM single_market_prices
      WHERE product_id = ?
      ORDER BY id DESC
      LIMIT 20
    `).all(Number(productId))

    return {
      ...single,
      marketPrices: prices || [],
    }
  })

  ipcMain.handle('singles:create', (event, payload) => {
    const db = getDb()

    const productPayload = {
      ...payload,
      product_type: 'single',
      card_name: normalizeText(payload?.card_name || payload?.name),
      name: normalizeText(payload?.name || payload?.card_name),
    }

    if (!productPayload.name) {
      throw new Error('Nombre de carta obligatorio.')
    }

    const result = db.prepare(`
      INSERT INTO products (
        sku, barcode, name, category, price, cost, stock, min_stock, image, active,
        product_type, game, card_name, set_name, set_code, collector_number, finish, language,
        card_condition, scryfall_id, starcity_url, starcity_variant_key, starcity_price_usd,
        starcity_last_sync, pricing_mode, pricing_formula_type, pricing_formula_value
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'single', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalizeText(productPayload.sku),
      normalizeText(productPayload.barcode),
      productPayload.name,
      normalizeText(productPayload.category || 'Singles'),
      normalizeNumber(productPayload.price),
      normalizeNumber(productPayload.cost),
      normalizeNumber(productPayload.stock),
      normalizeNumber(productPayload.min_stock),
      normalizeText(productPayload.image),
      normalizeText(productPayload.game),
      normalizeText(productPayload.card_name || productPayload.name),
      normalizeText(productPayload.set_name),
      normalizeText(productPayload.set_code),
      normalizeText(productPayload.collector_number),
      normalizeText(productPayload.finish),
      normalizeText(productPayload.language),
      normalizeText(productPayload.card_condition),
      normalizeText(productPayload.scryfall_id),
      normalizeText(productPayload.starcity_url),
      normalizeText(productPayload.starcity_variant_key),
      normalizeNumber(productPayload.starcity_price_usd),
      productPayload.starcity_last_sync ? String(productPayload.starcity_last_sync) : null,
      normalizeText(productPayload.pricing_mode || 'manual', 'manual'),
      normalizeText(productPayload.pricing_formula_type),
      normalizeNumber(productPayload.pricing_formula_value)
    )

    return {
      success: true,
      id: Number(result.lastInsertRowid),
    }
  })

  ipcMain.handle('singles:update', (event, payload = {}) => {
    const db = getDb()
    const productId = Number(payload.id || 0)

    if (!productId) {
      throw new Error('ID de single invalido.')
    }

    const current = getSingleById(db, productId)
    if (!current) {
      throw new Error('Single no encontrado.')
    }

    db.prepare(`
      UPDATE products
      SET
        sku = ?,
        barcode = ?,
        name = ?,
        category = ?,
        price = ?,
        cost = ?,
        stock = ?,
        min_stock = ?,
        image = ?,
        game = ?,
        card_name = ?,
        set_name = ?,
        set_code = ?,
        collector_number = ?,
        finish = ?,
        language = ?,
        card_condition = ?,
        scryfall_id = ?,
        starcity_url = ?,
        starcity_variant_key = ?,
        starcity_price_usd = ?,
        starcity_last_sync = ?,
        pricing_mode = ?,
        pricing_formula_type = ?,
        pricing_formula_value = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      normalizeText(payload.sku),
      normalizeText(payload.barcode),
      normalizeText(payload.name || payload.card_name || current.name),
      normalizeText(payload.category || current.category || 'Singles'),
      normalizeNumber(payload.price, Number(current.price || 0)),
      normalizeNumber(payload.cost, Number(current.cost || 0)),
      normalizeNumber(payload.stock, Number(current.stock || 0)),
      normalizeNumber(payload.min_stock, Number(current.min_stock || 0)),
      normalizeText(payload.image),
      normalizeText(payload.game),
      normalizeText(payload.card_name || payload.name || current.card_name || current.name),
      normalizeText(payload.set_name),
      normalizeText(payload.set_code),
      normalizeText(payload.collector_number),
      normalizeText(payload.finish),
      normalizeText(payload.language),
      normalizeText(payload.card_condition),
      normalizeText(payload.scryfall_id),
      normalizeText(payload.starcity_url),
      normalizeText(payload.starcity_variant_key),
      normalizeNumber(payload.starcity_price_usd, Number(current.starcity_price_usd || 0)),
      payload.starcity_last_sync ? String(payload.starcity_last_sync) : current.starcity_last_sync,
      normalizeText(payload.pricing_mode || current.pricing_mode || 'manual', 'manual'),
      normalizeText(payload.pricing_formula_type || current.pricing_formula_type),
      normalizeNumber(payload.pricing_formula_value, Number(current.pricing_formula_value || 0)),
      productId
    )

    return {
      success: true,
      id: productId,
    }
  })

  ipcMain.handle('singles:searchCatalog', async (event, payload = {}) => {
    const query = normalizeText(payload.query || payload.cardName)

    if (!query) {
      throw new Error('Debes enviar query para buscar en Star City.')
    }

    const filters = {
      query,
      game: normalizeText(payload.game || 'Magic: The Gathering'),
    }

    let searchResult = await fetchStarCitySearch(query)

    if (!(searchResult.results || []).length) {
      searchResult = await fetchSearchEngineStarCityResults(query, filters.game)
    }

    const candidates = (searchResult.results || []).map((row) => ({
      ...row,
      _score: scoreSearchResult(row, filters),
      _text: normalizeLooseText(`${row.title} ${row.url}`),
    }))
      .filter((row) => isLikelyProductUrl(row.url))
      .filter((row) => matchesGame(row, filters.game))
      .filter((row) => matchesQueryTerms(row, query))

    let filtered = candidates

    if (!filtered.length) {
      filtered = candidates
        .filter((row) => row._score > 0)
        .sort((a, b) => b._score - a._score || a.title.localeCompare(b.title))
    }

    if (!filtered.length) {
      filtered = candidates
    }

    return {
      success: true,
      sourceUrl: searchResult.sourceUrl,
      query,
      results: filtered.slice(0, 25).map((row, index) => ({
        variantKey: `${normalizeStarCityUrl(row.url)}#${index + 1}`,
        title: row.title,
        setName: '',
        finish: '',
        language: '',
        cardCondition: '',
        priceUsd: Number(row.priceUsd || 0),
        url: row.url,
      })),
    }
  })

  ipcMain.handle('singles:openStarCitySearch', async (event, payload = {}) => {
    const query = normalizeText(payload.query || payload.cardName)
    const game = normalizeText(payload.game || 'Magic: The Gathering')

    if (!query) {
      throw new Error('Debes escribir el nombre de la carta.')
    }

    const searchQuery = `${query} ${game}`.trim()
    const url = `https://www.google.com/search?q=${encodeURIComponent(`site:starcitygames.com ${searchQuery}`)}`

    await shell.openExternal(url)

    return {
      success: true,
      url,
    }
  })

  ipcMain.handle('singles:fetchPriceFromUrl', async (event, payload = {}) => {
    const result = await fetchStarCityPriceFromUrl(payload.url || payload.starcity_url)

    return {
      success: true,
      ...result,
    }
  })

  ipcMain.handle('singles:linkStarCity', (event, payload = {}) => {
    const db = getDb()
    const productId = Number(payload.productId || 0)

    if (!productId) {
      throw new Error('productId invalido.')
    }

    const single = getSingleById(db, productId)
    if (!single) {
      throw new Error('Single no encontrado.')
    }

    const url = normalizeText(payload.starcity_url || payload.url)
    const variantKey = normalizeText(payload.starcity_variant_key || payload.variantKey)
    const priceUsd = normalizeNumber(payload.starcity_price_usd ?? payload.priceUsd, Number(single.starcity_price_usd || 0))
    const priceMxn = normalizeNumber(payload.price, Number(single.price || 0))

    db.prepare(`
      UPDATE products
      SET
        starcity_url = ?,
        starcity_variant_key = ?,
        starcity_price_usd = ?,
        price = ?,
        starcity_last_sync = CASE WHEN ? > 0 THEN CURRENT_TIMESTAMP ELSE starcity_last_sync END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(url, variantKey, priceUsd, priceMxn, priceUsd, productId)

    return {
      success: true,
      product: getSingleById(db, productId),
    }
  })

  ipcMain.handle('singles:updateStarCityPrice', async (event, payload = {}) => {
    const db = getDb()
    const product = await refreshSingleStarCityPrice(db, payload)

    return {
      success: true,
      product,
    }
  })

  ipcMain.handle('singles:updateStarCityPricesBatch', async (event, payload = {}) => {
    const db = getDb()
    const where = [`COALESCE(product_type, 'normal') = 'single'`, `active = 1`, `starcity_url IS NOT NULL`, `trim(starcity_url) != ''`]

    const onlyIds = Array.isArray(payload.productIds) ? payload.productIds.map((id) => Number(id)).filter(Boolean) : []
    const params = []

    if (onlyIds.length) {
      where.push(`id IN (${onlyIds.map(() => '?').join(',')})`)
      params.push(...onlyIds)
    }

    const singles = db.prepare(`
      SELECT id, name, starcity_url, starcity_variant_key
      FROM products
      WHERE ${where.join(' AND ')}
      ORDER BY id ASC
    `).all(...params)

    const summary = {
      total: singles.length,
      updated: 0,
      failed: 0,
      errors: [],
    }

    for (const single of singles) {
      try {
        await refreshSingleStarCityPrice(db, { productId: Number(single.id) })
        summary.updated += 1
      } catch (error) {
        summary.failed += 1
        summary.errors.push({
          productId: Number(single.id),
          name: String(single.name || ''),
          message: error?.message || 'Error desconocido',
        })
      }
    }

    return {
      success: true,
      ...summary,
    }
  })

  ipcMain.handle('singles:recalculateSalePrice', (event, payload = {}) => {
    const db = getDb()
    const productId = Number(payload.productId || 0)

    if (!productId) {
      throw new Error('productId invalido.')
    }

    const product = getSingleById(db, productId)
    if (!product) {
      throw new Error('Single no encontrado.')
    }

    const config = getPricingConfig(db)
    const salePrice = calculateSalePrice(product, config)

    db.prepare(`
      UPDATE products
      SET
        price = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(Number(salePrice || 0), productId)

    return {
      success: true,
      salePriceMxn: Number(salePrice || 0),
      product: getSingleById(db, productId),
    }
  })

  ipcMain.handle('singles:getPricingConfig', () => {
    const db = getDb()
    return {
      success: true,
      config: getPricingConfig(db),
    }
  })

  ipcMain.handle('singles:updatePricingConfig', (event, payload = {}) => {
    const db = getDb()
    const config = setPricingConfig(db, payload)

    return {
      success: true,
      config,
    }
  })
}

module.exports = { registerSinglesHandlers }
