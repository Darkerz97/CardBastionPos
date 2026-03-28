const { ipcMain } = require('electron')
const { getDb } = require('../database/db.cjs')
const { enqueueAndFlushServerSync } = require('./server-sync.cjs')

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value).trim()
}

function registerInventoryHandlers() {
  ipcMain.handle('inventory:getProductMovements', (event, productId) => {
    const db = getDb()
    const id = Number(productId)

    if (!id) {
      throw new Error('ID de producto invalido.')
    }

    const movements = db.prepare(`
      SELECT
        im.id,
        im.product_id,
        im.type,
        im.quantity,
        im.stock_before,
        im.stock_after,
        im.reference_type,
        im.reference_id,
        im.notes,
        im.created_at
      FROM inventory_movements im
      WHERE im.product_id = ?
      ORDER BY im.created_at DESC, im.id DESC
      LIMIT 500
    `).all(id)

    return (movements || []).map((row) => ({
      id: Number(row.id),
      productId: Number(row.product_id),
      type: String(row.type || ''),
      quantity: Number(row.quantity || 0),
      stockBefore: Number(row.stock_before || 0),
      stockAfter: Number(row.stock_after || 0),
      referenceType: String(row.reference_type || ''),
      referenceId: row.reference_id ? Number(row.reference_id) : null,
      notes: String(row.notes || ''),
      createdAt: String(row.created_at || ''),
    }))
  })

  ipcMain.handle('inventory:adjustStock', async (event, payload) => {
    const db = getDb()

    const productId = Number(payload?.productId)
    const mode = toText(payload?.mode)
    const quantity = toNumber(payload?.quantity, 0)
    const notes = toText(payload?.notes)

    if (!productId) {
      throw new Error('Producto invalido para ajuste.')
    }

    if (!['add', 'remove', 'set'].includes(mode)) {
      throw new Error('Modo de ajuste invalido.')
    }

    if (quantity < 0) {
      throw new Error('La cantidad no puede ser negativa.')
    }

    if (!notes) {
      throw new Error('El motivo del ajuste es obligatorio.')
    }

    const product = db.prepare(`
      SELECT id, name, stock
      FROM products
      WHERE id = ?
      LIMIT 1
    `).get(productId)

    if (!product) {
      throw new Error('Producto no encontrado.')
    }

    const stockBefore = Number(product.stock || 0)
    let stockAfter = stockBefore

    if (mode === 'add') stockAfter = stockBefore + quantity
    if (mode === 'remove') stockAfter = stockBefore - quantity
    if (mode === 'set') stockAfter = quantity

    if (stockAfter < 0) {
      throw new Error('El ajuste dejaria stock negativo, operacion cancelada.')
    }

    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE products
        SET stock = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(stockAfter, productId)

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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        productId,
        mode === 'remove' ? 'loss' : 'adjust',
        Number(quantity || 0),
        stockBefore,
        stockAfter,
        'manual',
        null,
        notes
      )
    })

    transaction()

    const response = {
      success: true,
      productId,
      stockBefore,
      stockAfter,
    }

    await enqueueAndFlushServerSync(db, {
      eventType: 'inventory.adjust',
      entityType: 'product',
      entityId: productId,
      action: 'adjust',
      payload: {
        productId,
        mode,
        quantity,
        notes,
        stockBefore,
        stockAfter,
      },
    })

    return response
  })

  ipcMain.handle('inventory:addStockEntry', async (event, payload) => {
    const db = getDb()

    const productId = Number(payload?.productId)
    const quantity = toNumber(payload?.quantity, 0)
    const cost = payload?.cost === '' || payload?.cost === null || payload?.cost === undefined
      ? null
      : toNumber(payload.cost, 0)
    const notes = toText(payload?.notes)
    const reference = toText(payload?.reference)

    if (!productId) {
      throw new Error('Producto invalido para entrada de mercancia.')
    }

    if (quantity <= 0) {
      throw new Error('La cantidad de entrada debe ser mayor a 0.')
    }

    const product = db.prepare(`
      SELECT id, stock, cost
      FROM products
      WHERE id = ?
      LIMIT 1
    `).get(productId)

    if (!product) {
      throw new Error('Producto no encontrado.')
    }

    const stockBefore = Number(product.stock || 0)
    const stockAfter = stockBefore + quantity

    const transaction = db.transaction(() => {
      if (cost !== null) {
        db.prepare(`
          UPDATE products
          SET stock = ?, cost = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(stockAfter, cost, productId)
      } else {
        db.prepare(`
          UPDATE products
          SET stock = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(stockAfter, productId)
      }

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
        ) VALUES (?, 'in', ?, ?, ?, ?, ?, ?)
      `).run(
        productId,
        quantity,
        stockBefore,
        stockAfter,
        reference ? 'purchase' : 'manual',
        null,
        [reference, notes].filter(Boolean).join(' | ')
      )
    })

    transaction()

    const response = {
      success: true,
      productId,
      stockBefore,
      stockAfter,
    }

    await enqueueAndFlushServerSync(db, {
      eventType: 'inventory.entry',
      entityType: 'product',
      entityId: productId,
      action: 'entry',
      payload: {
        productId,
        quantity,
        cost,
        notes,
        reference,
        stockBefore,
        stockAfter,
      },
    })

    return response
  })

  ipcMain.handle('inventory:getLowStockProducts', () => {
    const db = getDb()

    const rows = db.prepare(`
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
        active
      FROM products
      WHERE active = 1
        AND COALESCE(stock, 0) <= COALESCE(min_stock, 0)
      ORDER BY (COALESCE(stock, 0) - COALESCE(min_stock, 0)) ASC, name ASC
    `).all()

    return rows || []
  })

  ipcMain.handle('inventory:getInventorySummary', (event, payload) => {
    const db = getDb()
    const inactiveDays = Math.max(Number(payload?.inactiveDays || 30), 1)

    const summary = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END), 0) as total_active_products,
        COALESCE(SUM(CASE WHEN active = 1 THEN stock ELSE 0 END), 0) as total_units_in_stock,
        COALESCE(SUM(CASE WHEN active = 1 THEN stock * COALESCE(cost, 0) ELSE 0 END), 0) as estimated_inventory_value,
        COALESCE(SUM(CASE WHEN active = 1 AND stock <= COALESCE(min_stock, 0) THEN 1 ELSE 0 END), 0) as low_stock_products
      FROM products
    `).get()

    const lowStockProducts = db.prepare(`
      SELECT
        id,
        name,
        sku,
        stock,
        COALESCE(min_stock, 0) as min_stock
      FROM products
      WHERE active = 1
        AND COALESCE(stock, 0) <= COALESCE(min_stock, 0)
      ORDER BY (COALESCE(stock, 0) - COALESCE(min_stock, 0)) ASC, name ASC
      LIMIT 50
    `).all()

    const topSoldProducts = db.prepare(`
      SELECT
        p.id,
        p.name,
        p.sku,
        COALESCE(SUM(si.qty), 0) as total_qty,
        COALESCE(SUM(si.line_total), 0) as total_sales
      FROM sale_items si
      INNER JOIN products p ON p.id = si.product_id
      GROUP BY p.id, p.name, p.sku
      ORDER BY total_qty DESC, total_sales DESC
      LIMIT 20
    `).all()

    const staleProducts = db.prepare(`
      SELECT
        p.id,
        p.name,
        p.sku,
        p.stock,
        p.updated_at,
        MAX(im.created_at) as last_movement_at
      FROM products p
      LEFT JOIN inventory_movements im ON im.product_id = p.id
      WHERE p.active = 1
      GROUP BY p.id, p.name, p.sku, p.stock, p.updated_at
      HAVING
        last_movement_at IS NULL OR
        datetime(last_movement_at) < datetime('now', ?)
      ORDER BY last_movement_at ASC
      LIMIT 50
    `).all(`-${inactiveDays} days`)

    return {
      success: true,
      inactiveDays,
      summary: {
        totalActiveProducts: Number(summary?.total_active_products || 0),
        totalUnitsInStock: Number(summary?.total_units_in_stock || 0),
        estimatedInventoryValue: Number(summary?.estimated_inventory_value || 0),
        lowStockProductsCount: Number(summary?.low_stock_products || 0),
      },
      lowStockProducts: (lowStockProducts || []).map((row) => ({
        id: Number(row.id),
        name: String(row.name || ''),
        sku: String(row.sku || ''),
        stock: Number(row.stock || 0),
        minStock: Number(row.min_stock || 0),
      })),
      topSoldProducts: (topSoldProducts || []).map((row) => ({
        id: Number(row.id),
        name: String(row.name || ''),
        sku: String(row.sku || ''),
        totalQty: Number(row.total_qty || 0),
        totalSales: Number(row.total_sales || 0),
      })),
      staleProducts: (staleProducts || []).map((row) => ({
        id: Number(row.id),
        name: String(row.name || ''),
        sku: String(row.sku || ''),
        stock: Number(row.stock || 0),
        updatedAt: String(row.updated_at || ''),
        lastMovementAt: String(row.last_movement_at || ''),
      })),
    }
  })
}

module.exports = { registerInventoryHandlers }
