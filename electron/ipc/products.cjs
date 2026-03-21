const { ipcMain, dialog, app } = require('electron')
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')
const XLSX = require('xlsx')
const { getDb } = require('../database/db.cjs')

function normalizeNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value).trim()
}

function findExistingProduct(db, product, ignoreId = null) {
  const conditions = []
  const params = []

  if (product.sku) {
    conditions.push(`sku = ?`)
    params.push(product.sku)
  }

  if (product.barcode) {
    conditions.push(`barcode = ?`)
    params.push(product.barcode)
  }

  if (!conditions.length) return null

  let query = `
    SELECT id
    FROM products
    WHERE (${conditions.join(' OR ')})
  `

  if (ignoreId) {
    query += ` AND id != ?`
    params.push(Number(ignoreId))
  }

  query += ` LIMIT 1`

  return db.prepare(query).get(...params)
}

function registerProductHandlers() {
 ipcMain.handle('products:selectImage', async () => {
  const fileResult = await dialog.showOpenDialog({
    title: 'Seleccionar imagen de producto',
    properties: ['openFile'],
    filters: [
      { name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
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

  console.log('Imagen copiada a:', destinationPath)

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

    // Compatibilidad con registros viejos: ruta completa
    if (path.isAbsolute(rawValue)) {
      fullPath = rawValue
    } else {
      // Registros nuevos: solo nombre de archivo
      const imagesDir = path.join(app.getPath('userData'), 'images')
      fullPath = path.join(imagesDir, rawValue)
    }

    console.log('Buscando imagen en:', fullPath)

    if (!fs.existsSync(fullPath)) {
      console.log('Imagen no encontrada:', fullPath)
      return ''
    }

    const ext = path.extname(fullPath).toLowerCase()
    let mimeType = 'image/png'

    if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg'
    else if (ext === '.webp') mimeType = 'image/webp'
    else if (ext === '.png') mimeType = 'image/png'

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

    return db.prepare(`
      SELECT id, sku, barcode, name, category, price, cost, stock, COALESCE(min_stock, 0) as min_stock, image, active
      FROM products
      WHERE active = 0
      ORDER BY name ASC
    `).all()
  })

  ipcMain.handle('products:reactivate', (event, productId) => {
    const db = getDb()
    const id = Number(productId)

    if (!id) {
      throw new Error('ID de producto inválido.')
    }

    db.prepare(`
      UPDATE products
      SET active = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id)

    return { success: true, id }
  })

  ipcMain.handle('products:deactivate', (event, productId) => {
    const db = getDb()
    const id = Number(productId)

    if (!id) {
      throw new Error('ID de producto inválido.')
    }

    db.prepare(`
      UPDATE products
      SET active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id)

    return { success: true, id }
  })

  ipcMain.handle('products:findByCode', (event, code) => {
    const db = getDb()
    const cleanCode = String(code || '').trim()

    if (!cleanCode) return null

    const product = db.prepare(`
      SELECT id, sku, barcode, name, category, price, cost, stock, COALESCE(min_stock, 0) as min_stock, image, active
      FROM products
      WHERE active = 1
        AND (barcode = ? OR sku = ?)
      LIMIT 1
    `).get(cleanCode, cleanCode)

    return product || null
  })

  ipcMain.handle('products:list', () => {
    const db = getDb()

    return db.prepare(`
      SELECT id, sku, barcode, name, category, price, cost, stock, COALESCE(min_stock, 0) as min_stock, image, active
      FROM products
      WHERE active = 1
      ORDER BY name ASC
    `).all()
  })

  ipcMain.handle('products:create', (event, payload) => {
    const db = getDb()

    const product = {
      sku: normalizeText(payload?.sku),
      barcode: normalizeText(payload?.barcode),
      name: normalizeText(payload?.name),
      category: normalizeText(payload?.category),
      price: normalizeNumber(payload?.price),
      cost: normalizeNumber(payload?.cost),
      stock: normalizeNumber(payload?.stock),
      min_stock: normalizeNumber(payload?.min_stock),
      image: normalizeText(payload?.image),
    }

    if (!product.name) {
      throw new Error('El nombre del producto es obligatorio.')
    }

    if (!product.sku && !product.barcode) {
      throw new Error('Debes capturar al menos SKU o código de barras.')
    }

    if (product.stock < 0) {
      throw new Error('El stock no puede ser menor a 0.')
    }

    if (product.min_stock < 0) {
      throw new Error('El stock minimo no puede ser menor a 0.')
    }

    const existing = findExistingProduct(db, product)

    if (existing) {
      throw new Error('Ya existe un producto con ese SKU o código de barras.')
    }

    const result = db.prepare(`
      INSERT INTO products (
        sku, barcode, name, category, price, cost, stock, min_stock, image, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      product.sku,
      product.barcode,
      product.name,
      product.category,
      product.price,
      product.cost,
      product.stock,
      product.min_stock,
      product.image
    )

    return {
      success: true,
      action: 'created',
      id: Number(result.lastInsertRowid),
    }
  })

  ipcMain.handle('products:update', (event, payload) => {
    const db = getDb()
    const productId = Number(payload?.id)

    if (!productId) {
      throw new Error('ID de producto inválido.')
    }

    const product = {
      sku: normalizeText(payload?.sku),
      barcode: normalizeText(payload?.barcode),
      name: normalizeText(payload?.name),
      category: normalizeText(payload?.category),
      price: normalizeNumber(payload?.price),
      cost: normalizeNumber(payload?.cost),
      stock: normalizeNumber(payload?.stock),
      min_stock: normalizeNumber(payload?.min_stock),
      image: normalizeText(payload?.image),
    }

    if (!product.name) {
      throw new Error('El nombre del producto es obligatorio.')
    }

    if (!product.sku && !product.barcode) {
      throw new Error('Debes capturar al menos SKU o código de barras.')
    }

    if (product.stock < 0) {
      throw new Error('El stock no puede ser menor a 0.')
    }

    if (product.min_stock < 0) {
      throw new Error('El stock minimo no puede ser menor a 0.')
    }

    const existing = findExistingProduct(db, product, productId)

    if (existing) {
      throw new Error('Otro producto ya usa ese SKU o código de barras.')
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
            notes
          ) VALUES (?, 'adjust', ?, ?, ?, 'manual', NULL, ?)
        `).run(
          productId,
          quantityDiff,
          stockBefore,
          stockAfter,
          'Ajuste desde edicion de producto'
        )
      }
    })

    transaction()

    return {
      success: true,
      action: 'updated',
      id: productId,
    }
  })

  ipcMain.handle('products:importExcel', async () => {
    const db = getDb()

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
          name: normalizeText(row.name || row.nombre || row.producto),
          category: normalizeText(row.category || row.categoria),
          price: normalizeNumber(row.price || row.precio),
          cost: normalizeNumber(row.cost || row.costo),
          stock: normalizeNumber(row.stock || row.existencia),
          min_stock: normalizeNumber(row.min_stock || row.stock_minimo || row.minimo || row.minStock),
          image: normalizeText(row.image || row.imagen),
        }

        if (!product.name || (!product.sku && !product.barcode)) {
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
            existing.id
          )
          updated += 1
        } else {
          db.prepare(`
            INSERT INTO products (
              sku, barcode, name, category, price, cost, stock, min_stock, image, active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          `).run(
            product.sku,
            product.barcode,
            product.name,
            product.category,
            product.price,
            product.cost,
            product.stock,
            product.min_stock,
            product.image
          )
          created += 1
        }
      }
    })

    transaction()

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
    const templateRows = [
      {
        sku: 'PKM-100',
        barcode: '750200001',
        name: 'Booster Pokémon Temporal Forces',
        category: 'Pokémon',
        price: 129,
        cost: 90,
        stock: 24,
        min_stock: 4,
        image: '',
      },
      {
        sku: 'MTG-210',
        barcode: '750200002',
        name: 'Play Booster Final Fantasy',
        category: 'Magic',
        price: 139,
        cost: 105,
        stock: 18,
        min_stock: 4,
        image: '',
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
}

module.exports = { registerProductHandlers }
