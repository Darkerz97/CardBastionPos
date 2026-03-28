const { ipcMain, dialog, app } = require('electron')
const path = require('path')
const fs = require('fs')
const XLSX = require('xlsx')
const { getDb } = require('../database/db.cjs')
const { requirePermission, getAuditActor } = require('../auth/helpers.cjs')
const { logAudit } = require('../audit.cjs')
const { enqueueAndFlushServerSync } = require('./server-sync.cjs')

function normalizeNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value).trim()
}

const PRODUCT_SELECT_FIELDS = `
  id,
  COALESCE(remote_id, '') as remote_id,
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
  updated_at,
  created_at
`

function findExistingProduct(db, product, ignoreId = null) {
  const conditions = []
  const params = []

  if (product.sku) {
    conditions.push('sku = ?')
    params.push(product.sku)
  }

  if (product.barcode) {
    conditions.push('barcode = ?')
    params.push(product.barcode)
  }

  if (!conditions.length) return null

  let query = `
    SELECT id
    FROM products
    WHERE (${conditions.join(' OR ')})
  `

  if (ignoreId) {
    query += ' AND id != ?'
    params.push(Number(ignoreId))
  }

  query += ' LIMIT 1'

  return db.prepare(query).get(...params)
}

function getSingleMetaFromPayload(payload = {}) {
  const productType = normalizeText(payload.product_type || 'normal', 'normal').toLowerCase() === 'single'
    ? 'single'
    : 'normal'

  return {
    product_type: productType,
    game: normalizeText(payload.game),
    card_name: normalizeText(payload.card_name || payload.name),
    set_name: normalizeText(payload.set_name),
    set_code: normalizeText(payload.set_code),
    collector_number: normalizeText(payload.collector_number),
    finish: normalizeText(payload.finish),
    language: normalizeText(payload.language),
    card_condition: normalizeText(payload.card_condition),
    scryfall_id: normalizeText(payload.scryfall_id),
    starcity_url: normalizeText(payload.starcity_url),
    starcity_variant_key: normalizeText(payload.starcity_variant_key),
    starcity_price_usd: normalizeNumber(payload.starcity_price_usd, 0),
    starcity_last_sync: payload.starcity_last_sync ? String(payload.starcity_last_sync) : null,
    pricing_mode: normalizeText(payload.pricing_mode || 'manual', 'manual'),
    pricing_formula_type: normalizeText(payload.pricing_formula_type),
    pricing_formula_value: normalizeNumber(payload.pricing_formula_value, 0),
  }
}

function getProductSnapshot(db, productId) {
  return db.prepare(`
    SELECT ${PRODUCT_SELECT_FIELDS}
    FROM products
    WHERE id = ?
    LIMIT 1
  `).get(Number(productId))
}

function registerProductHandlers() {
  ipcMain.handle('products:selectImage', async () => {
    const fileResult = await dialog.showOpenDialog({
      title: 'Seleccionar imagen de producto',
      properties: ['openFile'],
      filters: [
        { name: 'Imagenes', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
      ],
    })

    if (fileResult.canceled || !fileResult.filePaths?.length) {
      return { success: false, canceled: true }
    }

    const originalPath = fileResult.filePaths[0]
    const fileName = `${Date.now()}_${path.basename(originalPath)}`
    const imagesDir = path.join(app.getPath('userData'), 'images')

    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true })
    }

    const destinationPath = path.join(imagesDir, fileName)
    fs.copyFileSync(originalPath, destinationPath)

    return {
      success: true,
      fileName,
      fullPath: destinationPath,
    }
  })

  ipcMain.handle('products:getImageDataUrl', (event, imageValue) => {
    try {
      if (!imageValue) return ''

      const rawValue = String(imageValue).trim()
      let fullPath = ''

      if (path.isAbsolute(rawValue)) {
        fullPath = rawValue
      } else {
        const imagesDir = path.join(app.getPath('userData'), 'images')
        fullPath = path.join(imagesDir, rawValue)
      }

      if (!fs.existsSync(fullPath)) return ''

      const ext = path.extname(fullPath).toLowerCase()
      let mimeType = 'image/png'

      if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg'
      else if (ext === '.webp') mimeType = 'image/webp'

      const buffer = fs.readFileSync(fullPath)
      const base64 = buffer.toString('base64')

      return `data:${mimeType};base64,${base64}`
    } catch (error) {
      console.error('Error generando data URL de imagen:', error)
      return ''
    }
  })

  ipcMain.handle('products:listInactive', () => {
    const db = getDb()
    requirePermission('products', 'consultar productos inactivos')

    return db.prepare(`
      SELECT ${PRODUCT_SELECT_FIELDS}
      FROM products
      WHERE active = 0
      ORDER BY name ASC
    `).all()
  })

  ipcMain.handle('products:reactivate', async (event, productId) => {
    const db = getDb()
    const actor = getAuditActor()
    requirePermission('products', 'reactivar productos')
    const id = Number(productId)

    if (!id) {
      throw new Error('ID de producto invalido.')
    }

    db.prepare(`
      UPDATE products
      SET active = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id)

    logAudit(db, {
      userId: actor.userId,
      username: actor.username,
      displayName: actor.displayName,
      entityType: 'product',
      entityId: id,
      action: 'reactivate',
      description: `Producto ${id} reactivado`,
    })

    const response = { success: true, id }

    await enqueueAndFlushServerSync(db, {
      eventType: 'product.reactivate',
      entityType: 'product',
      entityId: id,
      action: 'reactivate',
      payload: {
        actor,
        product: getProductSnapshot(db, id),
      },
    })

    return response
  })

  ipcMain.handle('products:deactivate', async (event, productId) => {
    const db = getDb()
    const actor = getAuditActor()
    requirePermission('products', 'desactivar productos')
    const id = Number(productId)

    if (!id) {
      throw new Error('ID de producto invalido.')
    }

    db.prepare(`
      UPDATE products
      SET active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id)

    logAudit(db, {
      userId: actor.userId,
      username: actor.username,
      displayName: actor.displayName,
      entityType: 'product',
      entityId: id,
      action: 'deactivate',
      description: `Producto ${id} desactivado`,
    })

    const response = { success: true, id }

    await enqueueAndFlushServerSync(db, {
      eventType: 'product.deactivate',
      entityType: 'product',
      entityId: id,
      action: 'deactivate',
      payload: {
        actor,
        product: getProductSnapshot(db, id),
      },
    })

    return response
  })

  ipcMain.handle('products:findByCode', (event, code) => {
    const db = getDb()
    const cleanCode = String(code || '').trim()

    if (!cleanCode) return null

    const product = db.prepare(`
      SELECT ${PRODUCT_SELECT_FIELDS}
      FROM products
      WHERE active = 1
        AND (barcode = ? OR sku = ?)
      LIMIT 1
    `).get(cleanCode, cleanCode)

    return product || null
  })

  ipcMain.handle('products:list', () => {
    const db = getDb()
    requirePermission('products', 'consultar productos')

    return db.prepare(`
      SELECT ${PRODUCT_SELECT_FIELDS}
      FROM products
      WHERE active = 1
      ORDER BY name ASC
    `).all()
  })

  ipcMain.handle('products:create', async (event, payload) => {
    const db = getDb()
    const actor = getAuditActor()
    requirePermission('products', 'crear productos')
    const singleMeta = getSingleMetaFromPayload(payload)

    const product = {
      sku: normalizeText(payload?.sku),
      barcode: normalizeText(payload?.barcode),
      name: normalizeText(payload?.name || payload?.card_name),
      category: normalizeText(payload?.category),
      price: normalizeNumber(payload?.price),
      cost: normalizeNumber(payload?.cost),
      stock: normalizeNumber(payload?.stock),
      min_stock: normalizeNumber(payload?.min_stock),
      image: normalizeText(payload?.image),
      ...singleMeta,
    }

    if (!product.name) {
      throw new Error('El nombre del producto es obligatorio.')
    }

    if (product.product_type !== 'single' && !product.sku && !product.barcode) {
      throw new Error('Debes capturar al menos SKU o codigo de barras.')
    }

    if (product.stock < 0) {
      throw new Error('El stock no puede ser menor a 0.')
    }

    if (product.min_stock < 0) {
      throw new Error('El stock minimo no puede ser menor a 0.')
    }

    const existing = findExistingProduct(db, product)

    if (existing) {
      throw new Error('Ya existe un producto con ese SKU o codigo de barras.')
    }

    const result = db.prepare(`
      INSERT INTO products (
        sku, barcode, name, category, price, cost, stock, min_stock, image, active,
        product_type, game, card_name, set_name, set_code, collector_number, finish, language,
        card_condition, scryfall_id, starcity_url, starcity_variant_key, starcity_price_usd,
        starcity_last_sync, pricing_mode, pricing_formula_type, pricing_formula_value
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      product.sku,
      product.barcode,
      product.name,
      product.category,
      product.price,
      product.cost,
      product.stock,
      product.min_stock,
      product.image,
      product.product_type,
      product.game,
      product.card_name,
      product.set_name,
      product.set_code,
      product.collector_number,
      product.finish,
      product.language,
      product.card_condition,
      product.scryfall_id,
      product.starcity_url,
      product.starcity_variant_key,
      product.starcity_price_usd,
      product.starcity_last_sync,
      product.pricing_mode,
      product.pricing_formula_type,
      product.pricing_formula_value
    )

    const productId = Number(result.lastInsertRowid)

    logAudit(db, {
      userId: actor.userId,
      username: actor.username,
      displayName: actor.displayName,
      entityType: 'product',
      entityId: productId,
      action: 'create',
      description: `Producto ${product.name} creado`,
      payloadJson: { sku: product.sku, category: product.category },
    })

    const response = {
      success: true,
      action: 'created',
      id: productId,
    }

    await enqueueAndFlushServerSync(db, {
      eventType: 'product.create',
      entityType: 'product',
      entityId: productId,
      action: 'create',
      payload: {
        actor,
        product: getProductSnapshot(db, productId),
      },
    })

    return response
  })

  ipcMain.handle('products:update', async (event, payload) => {
    const db = getDb()
    const actor = getAuditActor()
    requirePermission('products', 'editar productos')
    const productId = Number(payload?.id)

    if (!productId) {
      throw new Error('ID de producto invalido.')
    }

    const singleMeta = getSingleMetaFromPayload(payload)

    const product = {
      sku: normalizeText(payload?.sku),
      barcode: normalizeText(payload?.barcode),
      name: normalizeText(payload?.name || payload?.card_name),
      category: normalizeText(payload?.category),
      price: normalizeNumber(payload?.price),
      cost: normalizeNumber(payload?.cost),
      stock: normalizeNumber(payload?.stock),
      min_stock: normalizeNumber(payload?.min_stock),
      image: normalizeText(payload?.image),
      ...singleMeta,
    }

    if (!product.name) {
      throw new Error('El nombre del producto es obligatorio.')
    }

    if (product.product_type !== 'single' && !product.sku && !product.barcode) {
      throw new Error('Debes capturar al menos SKU o codigo de barras.')
    }

    if (product.stock < 0) {
      throw new Error('El stock no puede ser menor a 0.')
    }

    if (product.min_stock < 0) {
      throw new Error('El stock minimo no puede ser menor a 0.')
    }

    const existing = findExistingProduct(db, product, productId)

    if (existing) {
      throw new Error('Otro producto ya usa ese SKU o codigo de barras.')
    }

    const current = db.prepare(`
      SELECT id, stock
      FROM products
      WHERE id = ?
      LIMIT 1
    `).get(productId)

    if (!current) {
      throw new Error('Producto no encontrado.')
    }

    const transaction = db.transaction(() => {
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
          product_type = ?,
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
        product.sku,
        product.barcode,
        product.name,
        product.category,
        product.price,
        product.cost,
        product.stock,
        product.min_stock,
        product.image,
        product.product_type,
        product.game,
        product.card_name,
        product.set_name,
        product.set_code,
        product.collector_number,
        product.finish,
        product.language,
        product.card_condition,
        product.scryfall_id,
        product.starcity_url,
        product.starcity_variant_key,
        product.starcity_price_usd,
        product.starcity_last_sync,
        product.pricing_mode,
        product.pricing_formula_type,
        product.pricing_formula_value,
        productId
      )

      const stockBefore = Number(current.stock || 0)
      const stockAfter = Number(product.stock || 0)
      const quantityDiff = Math.abs(stockAfter - stockBefore)

      if (quantityDiff > 0) {
        db.prepare(`
          INSERT INTO inventory_movements (
            product_id,
            type,
            quantity,
            stock_before,
            stock_after,
          reference_type,
          reference_id,
          notes,
          user_id
          ) VALUES (?, 'adjust', ?, ?, ?, 'manual', NULL, ?, ?)
        `).run(
          productId,
          quantityDiff,
          stockBefore,
          stockAfter,
          'Ajuste desde edicion de producto',
          actor.userId || null
        )
      }
    })

    transaction()

    logAudit(db, {
      userId: actor.userId,
      username: actor.username,
      displayName: actor.displayName,
      entityType: 'product',
      entityId: productId,
      action: 'update',
      description: `Producto ${product.name} actualizado`,
      payloadJson: { sku: product.sku, category: product.category },
    })

    const response = {
      success: true,
      action: 'updated',
      id: productId,
    }

    await enqueueAndFlushServerSync(db, {
      eventType: 'product.update',
      entityType: 'product',
      entityId: productId,
      action: 'update',
      payload: {
        actor,
        product: getProductSnapshot(db, productId),
      },
    })

    return response
  })

  ipcMain.handle('products:importExcel', async () => {
    const db = getDb()
    const actor = getAuditActor()
    requirePermission('products', 'importar productos')

    const fileResult = await dialog.showOpenDialog({
      title: 'Seleccionar archivo de productos',
      properties: ['openFile'],
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls', 'csv'] }],
    })

    if (fileResult.canceled || !fileResult.filePaths?.length) {
      return { success: false, canceled: true }
    }

    const filePath = fileResult.filePaths[0]
    const workbook = XLSX.readFile(filePath)
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })

    let created = 0
    let updated = 0
    let skipped = 0

    const transaction = db.transaction(() => {
      for (const row of rows) {
        const product = {
          sku: normalizeText(row.sku || row.SKU),
          barcode: normalizeText(row.barcode || row.BARCODE || row.codigo_barras || row.codigo),
          name: normalizeText(row.name || row.nombre || row.producto || row.card_name),
          category: normalizeText(row.category || row.categoria),
          price: normalizeNumber(row.price || row.precio),
          cost: normalizeNumber(row.cost || row.costo),
          stock: normalizeNumber(row.stock || row.existencia),
          min_stock: normalizeNumber(row.min_stock || row.stock_minimo || row.minimo || row.minStock),
          image: normalizeText(row.image || row.imagen),
          product_type: normalizeText(row.product_type || row.tipo_producto || 'normal', 'normal').toLowerCase() === 'single'
            ? 'single'
            : 'normal',
          game: normalizeText(row.game || row.juego),
          card_name: normalizeText(row.card_name || row.nombre_carta || row.name || row.nombre || row.producto),
          set_name: normalizeText(row.set_name || row.edicion),
          set_code: normalizeText(row.set_code || row.codigo_set),
          collector_number: normalizeText(row.collector_number || row.numero_coleccion),
          finish: normalizeText(row.finish || row.acabado),
          language: normalizeText(row.language || row.idioma),
          card_condition: normalizeText(row.card_condition || row.condicion),
          scryfall_id: normalizeText(row.scryfall_id),
          starcity_url: normalizeText(row.starcity_url),
          starcity_variant_key: normalizeText(row.starcity_variant_key),
          starcity_price_usd: normalizeNumber(row.starcity_price_usd),
          starcity_last_sync: normalizeText(row.starcity_last_sync) || null,
          pricing_mode: normalizeText(row.pricing_mode || 'manual', 'manual'),
          pricing_formula_type: normalizeText(row.pricing_formula_type),
          pricing_formula_value: normalizeNumber(row.pricing_formula_value),
        }

        if (!product.name || (product.product_type !== 'single' && !product.sku && !product.barcode)) {
          skipped += 1
          continue
        }

        const existing = findExistingProduct(db, product)

        if (existing) {
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
              product_type = ?,
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
              active = 1,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            product.sku,
            product.barcode,
            product.name,
            product.category,
            product.price,
            product.cost,
            product.stock,
            product.min_stock,
            product.image,
            product.product_type,
            product.game,
            product.card_name,
            product.set_name,
            product.set_code,
            product.collector_number,
            product.finish,
            product.language,
            product.card_condition,
            product.scryfall_id,
            product.starcity_url,
            product.starcity_variant_key,
            product.starcity_price_usd,
            product.starcity_last_sync,
            product.pricing_mode,
            product.pricing_formula_type,
            product.pricing_formula_value,
            existing.id
          )
          updated += 1
        } else {
          db.prepare(`
            INSERT INTO products (
              sku, barcode, name, category, price, cost, stock, min_stock, image, active,
              product_type, game, card_name, set_name, set_code, collector_number, finish, language,
              card_condition, scryfall_id, starcity_url, starcity_variant_key, starcity_price_usd,
              starcity_last_sync, pricing_mode, pricing_formula_type, pricing_formula_value
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            product.sku,
            product.barcode,
            product.name,
            product.category,
            product.price,
            product.cost,
            product.stock,
            product.min_stock,
            product.image,
            product.product_type,
            product.game,
            product.card_name,
            product.set_name,
            product.set_code,
            product.collector_number,
            product.finish,
            product.language,
            product.card_condition,
            product.scryfall_id,
            product.starcity_url,
            product.starcity_variant_key,
            product.starcity_price_usd,
            product.starcity_last_sync,
            product.pricing_mode,
            product.pricing_formula_type,
            product.pricing_formula_value
          )
          created += 1
        }
      }
    })

    transaction()

    logAudit(db, {
      userId: actor.userId,
      username: actor.username,
      displayName: actor.displayName,
      entityType: 'product_import',
      entityId: null,
      action: 'import',
      description: 'Importacion de productos desde Excel',
      payloadJson: { filePath, created, updated, skipped, totalRows: rows.length },
    })

    return {
      success: true,
      filePath,
      created,
      updated,
      skipped,
      totalRows: rows.length,
    }
  })

  ipcMain.handle('products:exportTemplate', async () => {
    requirePermission('products', 'exportar plantilla de productos')
    const templateRows = [
      {
        sku: 'PKM-100',
        barcode: '750200001',
        name: 'Booster Pokemon Temporal Forces',
        category: 'Pokemon',
        price: 129,
        cost: 90,
        stock: 24,
        min_stock: 4,
        image: '',
        product_type: 'normal',
        game: '',
        card_name: '',
        set_name: '',
        set_code: '',
        collector_number: '',
        finish: '',
        language: '',
        card_condition: '',
        starcity_url: '',
        starcity_variant_key: '',
        starcity_price_usd: 0,
        pricing_mode: 'manual',
        pricing_formula_type: '',
        pricing_formula_value: 0,
      },
      {
        sku: 'MTG-SINGLE-001',
        barcode: '',
        name: 'Lightning Bolt',
        category: 'Singles',
        price: 120,
        cost: 80,
        stock: 3,
        min_stock: 1,
        image: '',
        product_type: 'single',
        game: 'Magic: The Gathering',
        card_name: 'Lightning Bolt',
        set_name: 'Magic 2010',
        set_code: 'M10',
        collector_number: '146',
        finish: 'nonfoil',
        language: 'EN',
        card_condition: 'NM',
        starcity_url: '',
        starcity_variant_key: '',
        starcity_price_usd: 0,
        pricing_mode: 'starcity_formula',
        pricing_formula_type: 'multiplier',
        pricing_formula_value: 1.15,
      },
    ]

    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.json_to_sheet(templateRows)
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Productos')

    const saveResult = await dialog.showSaveDialog({
      title: 'Guardar plantilla de productos',
      defaultPath: path.join(process.cwd(), 'plantilla_productos_cardbastion.xlsx'),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    })

    if (saveResult.canceled || !saveResult.filePath) {
      return { success: false, canceled: true }
    }

    XLSX.writeFile(workbook, saveResult.filePath)

    return {
      success: true,
      filePath: saveResult.filePath,
    }
  })

  ipcMain.handle('products:delete', async (event, payload) => {
    const db = getDb()
    const actor = getAuditActor()
    requirePermission('products', 'eliminar productos')
    const productId = Number(payload?.id || payload || 0)

    if (!productId) {
      throw new Error('Producto invalido.')
    }

    const product = db.prepare(`
      SELECT id, name, sku
      FROM products
      WHERE id = ?
      LIMIT 1
    `).get(productId)

    if (!product) {
      throw new Error('Producto no encontrado.')
    }

    const references = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM sale_items WHERE product_id = ?) as sale_refs,
        (SELECT COUNT(*) FROM preorder_items WHERE product_id = ?) as preorder_refs,
        (SELECT COUNT(*) FROM inventory_movements WHERE product_id = ?) as movement_refs
    `).get(productId, productId, productId)

    if (Number(references.sale_refs || 0) > 0 || Number(references.preorder_refs || 0) > 0 || Number(references.movement_refs || 0) > 0) {
      throw new Error('Este producto ya tiene historial. Puedes desactivarlo, pero no eliminarlo permanentemente.')
    }

    db.prepare(`DELETE FROM products WHERE id = ?`).run(productId)

    logAudit(db, {
      userId: actor.userId,
      username: actor.username,
      displayName: actor.displayName,
      entityType: 'product',
      entityId: productId,
      action: 'delete',
      description: `Producto ${product.name} eliminado`,
      payloadJson: { sku: String(product.sku || '') },
    })

    const response = { success: true, id: productId }

    await enqueueAndFlushServerSync(db, {
      eventType: 'product.delete',
      entityType: 'product',
      entityId: productId,
      action: 'delete',
      payload: {
        actor,
        id: productId,
        sku: String(product.sku || ''),
        name: String(product.name || ''),
      },
    })

    return response
  })

  ipcMain.handle('products:getCatalogOptions', () => {
    const db = getDb()
    requirePermission('products', 'consultar catalogos de productos')

    const readDistinct = (column) => db.prepare(`
      SELECT DISTINCT TRIM(${column}) as value
      FROM products
      WHERE ${column} IS NOT NULL
        AND TRIM(${column}) != ''
      ORDER BY value ASC
    `).all().map((row) => String(row.value || ''))

    return {
      categories: readDistinct('category'),
      games: readDistinct('game'),
      sets: readDistinct('set_name'),
      finishes: readDistinct('finish'),
      languages: readDistinct('language'),
      conditions: readDistinct('card_condition'),
    }
  })
}

module.exports = { registerProductHandlers }
