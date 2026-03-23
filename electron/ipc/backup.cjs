const { ipcMain, dialog, app } = require('electron')
const path = require('path')
const fs = require('fs')
const { getDb, getDatabasePath, closeDb } = require('../database/db.cjs')

const BACKUP_EXTENSION = 'cardbastion-backup'
const BACKUP_DB_FILE = 'cardbastion.sqlite'
const BACKUP_MANIFEST_FILE = 'manifest.json'
const BACKUP_IMAGES_DIR = 'images'

function getImagesDirPath() {
  return path.join(app.getPath('userData'), BACKUP_IMAGES_DIR)
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function removePathIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) return
  fs.rmSync(targetPath, { recursive: true, force: true })
}

function copyDirectoryContents(sourceDir, destinationDir) {
  if (!fs.existsSync(sourceDir)) return

  ensureDirectory(destinationDir)

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name)
    const destinationPath = path.join(destinationDir, entry.name)

    if (entry.isDirectory()) {
      copyDirectoryContents(sourcePath, destinationPath)
      continue
    }

    fs.copyFileSync(sourcePath, destinationPath)
  }
}

function countFilesRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) return 0

  let total = 0
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      total += countFilesRecursive(fullPath)
    } else {
      total += 1
    }
  }

  return total
}

function getTimestampForFileName() {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19)
}

function isDirectoryBackup(selectedPath) {
  try {
    return fs.existsSync(selectedPath) && fs.statSync(selectedPath).isDirectory()
  } catch {
    return false
  }
}

async function createCompleteBackup(backupDirPath) {
  const db = getDb()
  const imagesDir = getImagesDirPath()
  const backupDbPath = path.join(backupDirPath, BACKUP_DB_FILE)
  const backupImagesPath = path.join(backupDirPath, BACKUP_IMAGES_DIR)
  const manifestPath = path.join(backupDirPath, BACKUP_MANIFEST_FILE)

  ensureDirectory(backupDirPath)
  await db.backup(backupDbPath)

  const imagesIncluded = fs.existsSync(imagesDir)
  if (imagesIncluded) {
    copyDirectoryContents(imagesDir, backupImagesPath)
  }

  const manifest = {
    format: 2,
    createdAt: new Date().toISOString(),
    databaseFile: BACKUP_DB_FILE,
    includes: {
      database: true,
      images: imagesIncluded,
    },
    imagesFileCount: countFilesRecursive(imagesDir),
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')

  return {
    backupDirPath,
    imagesIncluded: manifest.includes.images,
    imagesFileCount: manifest.imagesFileCount,
  }
}

function restoreLegacyDatabaseBackup(selectedPath, dbPath, tempBackupPath) {
  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, tempBackupPath)
  }

  closeDb()
  fs.copyFileSync(selectedPath, dbPath)

  return {
    restoredImages: false,
    legacyBackup: true,
    manifest: null,
  }
}

function restoreDirectoryBackup(selectedPath, dbPath, tempBackupPath) {
  const manifestPath = path.join(selectedPath, BACKUP_MANIFEST_FILE)
  const backupDbPath = path.join(selectedPath, BACKUP_DB_FILE)
  const backupImagesPath = path.join(selectedPath, BACKUP_IMAGES_DIR)
  const imagesDir = getImagesDirPath()

  if (!fs.existsSync(backupDbPath)) {
    throw new Error('El respaldo seleccionado no contiene la base de datos.')
  }

  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, tempBackupPath)
  }

  closeDb()
  fs.copyFileSync(backupDbPath, dbPath)

  let restoredImages = false
  if (fs.existsSync(backupImagesPath)) {
    removePathIfExists(imagesDir)
    copyDirectoryContents(backupImagesPath, imagesDir)
    restoredImages = true
  }

  let manifest = null
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    } catch (error) {
      console.warn('No se pudo leer el manifest del respaldo:', error)
    }
  }

  return {
    restoredImages,
    legacyBackup: false,
    manifest,
  }
}

function registerBackupHandlers() {
  ipcMain.handle('backup:create', async () => {
    try {
      const dbPath = getDatabasePath()

      if (!fs.existsSync(dbPath)) {
        throw new Error('No se encontro la base de datos local.')
      }

      const timestamp = getTimestampForFileName()
      const backupFolderName = `cardbastion_backup_${timestamp}.${BACKUP_EXTENSION}`

      const destinationResult = await dialog.showOpenDialog({
        title: 'Seleccionar carpeta para guardar respaldo completo',
        defaultPath: process.cwd(),
        properties: ['openDirectory', 'createDirectory'],
      })

      if (destinationResult.canceled || !destinationResult.filePaths?.length) {
        return { success: false, canceled: true }
      }

      const selectedDir = destinationResult.filePaths[0]
      const backupDirPath = path.join(selectedDir, backupFolderName)

      if (fs.existsSync(backupDirPath)) {
        throw new Error('Ya existe un respaldo con ese nombre en la carpeta seleccionada.')
      }

      const result = await createCompleteBackup(backupDirPath)

      return {
        success: true,
        filePath: result.backupDirPath,
        backupType: 'complete',
        includes: {
          database: true,
          images: result.imagesIncluded,
        },
        imagesFileCount: result.imagesFileCount,
      }
    } catch (error) {
      console.error('Error creando respaldo:', error)
      throw error
    }
  })

  ipcMain.handle('backup:restore', async () => {
    try {
      const openResult = await dialog.showOpenDialog({
        title: 'Seleccionar respaldo completo o archivo SQLite',
        properties: ['openFile', 'openDirectory'],
        filters: [
          { name: 'Respaldos Card Bastion', extensions: [BACKUP_EXTENSION] },
          { name: 'SQLite', extensions: ['sqlite', 'db'] },
        ],
      })

      if (openResult.canceled || !openResult.filePaths?.length) {
        return { success: false, canceled: true }
      }

      const selectedPath = openResult.filePaths[0]
      const userDataPath = app.getPath('userData')
      const dbPath = getDatabasePath()
      const tempBackupPath = path.join(userDataPath, 'cardbastion_before_restore.sqlite')

      const restoreResult = isDirectoryBackup(selectedPath)
        ? restoreDirectoryBackup(selectedPath, dbPath, tempBackupPath)
        : restoreLegacyDatabaseBackup(selectedPath, dbPath, tempBackupPath)

      return {
        success: true,
        restoredFrom: selectedPath,
        dbPath,
        restoredImages: restoreResult.restoredImages,
        legacyBackup: restoreResult.legacyBackup,
        manifest: restoreResult.manifest,
      }
    } catch (error) {
      console.error('Error restaurando respaldo:', error)
      throw error
    }
  })

  ipcMain.handle('backup:getDbInfo', async () => {
    try {
      const dbPath = getDatabasePath()
      const imagesDir = getImagesDirPath()

      if (!fs.existsSync(dbPath)) {
        return {
          exists: false,
          dbPath,
          imagesDir,
          imagesCount: countFilesRecursive(imagesDir),
        }
      }

      const stats = fs.statSync(dbPath)

      return {
        exists: true,
        dbPath,
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        imagesDir,
        imagesCount: countFilesRecursive(imagesDir),
      }
    } catch (error) {
      console.error('Error leyendo info de DB:', error)
      throw error
    }
  })
}

module.exports = { registerBackupHandlers }
