const { ipcMain, dialog, app } = require('electron')
const path = require('path')
const fs = require('fs')

function registerBackupHandlers() {
  ipcMain.handle('backup:create', async () => {
    try {
      const userDataPath = app.getPath('userData')
      const dbPath = path.join(userDataPath, 'cardbastion.sqlite')

      if (!fs.existsSync(dbPath)) {
        throw new Error('No se encontró la base de datos local.')
      }

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .slice(0, 19)

      const defaultFileName = `cardbastion_backup_${timestamp}.sqlite`

      const saveResult = await dialog.showSaveDialog({
        title: 'Guardar respaldo de base de datos',
        defaultPath: path.join(process.cwd(), defaultFileName),
        filters: [
          { name: 'SQLite', extensions: ['sqlite', 'db'] },
        ],
      })

      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, canceled: true }
      }

      fs.copyFileSync(dbPath, saveResult.filePath)

      return {
        success: true,
        filePath: saveResult.filePath,
      }
    } catch (error) {
      console.error('Error creando respaldo:', error)
      throw error
    }
  })

  ipcMain.handle('backup:restore', async () => {
    try {
      const openResult = await dialog.showOpenDialog({
        title: 'Seleccionar respaldo a restaurar',
        properties: ['openFile'],
        filters: [
          { name: 'SQLite', extensions: ['sqlite', 'db'] },
        ],
      })

      if (openResult.canceled || !openResult.filePaths?.length) {
        return { success: false, canceled: true }
      }

      const selectedPath = openResult.filePaths[0]
      const userDataPath = app.getPath('userData')
      const dbPath = path.join(userDataPath, 'cardbastion.sqlite')
      const tempBackupPath = path.join(userDataPath, 'cardbastion_before_restore.sqlite')

      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, tempBackupPath)
      }

      fs.copyFileSync(selectedPath, dbPath)

      return {
        success: true,
        restoredFrom: selectedPath,
        dbPath,
      }
    } catch (error) {
      console.error('Error restaurando respaldo:', error)
      throw error
    }
  })

  ipcMain.handle('backup:getDbInfo', async () => {
    try {
      const userDataPath = app.getPath('userData')
      const dbPath = path.join(userDataPath, 'cardbastion.sqlite')

      if (!fs.existsSync(dbPath)) {
        return {
          exists: false,
          dbPath,
        }
      }

      const stats = fs.statSync(dbPath)

      return {
        exists: true,
        dbPath,
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      }
    } catch (error) {
      console.error('Error leyendo info de DB:', error)
      throw error
    }
  })
}

module.exports = { registerBackupHandlers }