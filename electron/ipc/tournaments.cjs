const { ipcMain } = require('electron')
const { getDb } = require('../database/db.cjs')

function toInt(value, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.trunc(parsed)
}

function toNum(value, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return parsed
}

function normalizeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value).trim()
}

function randomShuffle(input) {
  const arr = [...input]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function pairKey(a, b) {
  const left = Math.min(Number(a), Number(b))
  const right = Math.max(Number(a), Number(b))
  return `${left}-${right}`
}

function buildTableChunks(orderedPlayers, tableSize, requestedTableCount) {
  const playerCount = orderedPlayers.length
  const minTables = Math.ceil(playerCount / tableSize)

  let tableCount = requestedTableCount && requestedTableCount > 0
    ? requestedTableCount
    : minTables

  if (tableCount < minTables) {
    throw new Error(`Con mesa de ${tableSize} jugadores necesitas minimo ${minTables} mesa(s).`)
  }

  tableCount = Math.min(tableCount, Math.max(playerCount, 1))

  const base = Math.floor(playerCount / tableCount)
  const extra = playerCount % tableCount
  const targets = Array.from({ length: tableCount }, (_, index) => base + (index < extra ? 1 : 0))

  if (targets.some((target) => target > tableSize)) {
    throw new Error('La cantidad de mesas seleccionada no puede sentar a todos los jugadores con ese tamano de mesa.')
  }

  const chunks = []
  let cursor = 0

  for (const size of targets) {
    const chunk = orderedPlayers.slice(cursor, cursor + size)
    if (chunk.length) {
      chunks.push(chunk)
    }
    cursor += size
  }

  return chunks
}

function getTournamentDetail(db, tournamentId) {
  const tournament = db.prepare(`
    SELECT
      id,
      name,
      game_type,
      season,
      status,
      notes,
      completed_at,
      created_at,
      updated_at
    FROM tournaments
    WHERE id = ?
    LIMIT 1
  `).get(Number(tournamentId))

  if (!tournament) {
    throw new Error('Torneo no encontrado.')
  }

  const players = db.prepare(`
    SELECT
      tp.id,
      tp.tournament_id,
      tp.customer_id,
      tp.display_name,
      tp.seed,
      tp.final_place,
      tp.points,
      tp.wins,
      tp.losses,
      tp.draws,
      tp.created_at,
      c.name as customer_name
    FROM tournament_players tp
    LEFT JOIN customers c ON c.id = tp.customer_id
    WHERE tp.tournament_id = ?
    ORDER BY
      CASE WHEN tp.final_place IS NULL THEN 1 ELSE 0 END,
      tp.final_place ASC,
      tp.points DESC,
      tp.wins DESC,
      tp.losses ASC,
      tp.seed ASC,
      tp.id ASC
  `).all(Number(tournamentId))

  const tables = db.prepare(`
    SELECT
      tt.id,
      tt.tournament_id,
      tt.round_number,
      tt.table_number,
      tt.table_size,
      tt.winner_player_id,
      tt.result_note,
      tt.status,
      tt.created_at,
      tt.updated_at
    FROM tournament_tables tt
    WHERE tt.tournament_id = ?
    ORDER BY tt.round_number DESC, tt.table_number ASC, tt.id ASC
  `).all(Number(tournamentId))

  const tableIds = (tables || []).map((table) => Number(table.id))
  const placeholders = tableIds.map(() => '?').join(', ')

  const tablePlayers = tableIds.length
    ? db.prepare(`
      SELECT
        ttp.id,
        ttp.table_id,
        ttp.tournament_player_id,
        ttp.seat,
        ttp.score,
        ttp.is_winner,
        tp.display_name,
        tp.customer_id
      FROM tournament_table_players ttp
      INNER JOIN tournament_players tp ON tp.id = ttp.tournament_player_id
      WHERE ttp.table_id IN (${placeholders})
      ORDER BY ttp.table_id ASC, ttp.seat ASC, ttp.id ASC
    `).all(...tableIds)
    : []

  const tablePlayerMap = new Map()

  for (const row of tablePlayers) {
    const key = Number(row.table_id)
    if (!tablePlayerMap.has(key)) {
      tablePlayerMap.set(key, [])
    }

    tablePlayerMap.get(key).push({
      id: Number(row.id),
      tableId: Number(row.table_id),
      tournamentPlayerId: Number(row.tournament_player_id),
      displayName: String(row.display_name || ''),
      customerId: row.customer_id ? Number(row.customer_id) : null,
      seat: Number(row.seat || 0),
      score: Number(row.score || 0),
      isWinner: Number(row.is_winner || 0) === 1,
    })
  }

  return {
    success: true,
    tournament: {
      id: Number(tournament.id),
      name: String(tournament.name || ''),
      gameType: String(tournament.game_type || ''),
      season: String(tournament.season || ''),
      status: String(tournament.status || 'draft'),
      notes: String(tournament.notes || ''),
      completedAt: String(tournament.completed_at || ''),
      createdAt: String(tournament.created_at || ''),
      updatedAt: String(tournament.updated_at || ''),
    },
    players: (players || []).map((row) => ({
      id: Number(row.id),
      tournamentId: Number(row.tournament_id),
      customerId: row.customer_id ? Number(row.customer_id) : null,
      customerName: String(row.customer_name || ''),
      displayName: String(row.display_name || ''),
      seed: Number(row.seed || 0),
      finalPlace: row.final_place ? Number(row.final_place) : null,
      points: Number(row.points || 0),
      wins: Number(row.wins || 0),
      losses: Number(row.losses || 0),
      draws: Number(row.draws || 0),
      createdAt: String(row.created_at || ''),
    })),
    tables: (tables || []).map((row) => ({
      id: Number(row.id),
      tournamentId: Number(row.tournament_id),
      roundNumber: Number(row.round_number || 1),
      tableNumber: Number(row.table_number || 1),
      tableSize: Number(row.table_size || 2),
      winnerPlayerId: row.winner_player_id ? Number(row.winner_player_id) : null,
      resultNote: String(row.result_note || ''),
      status: String(row.status || 'open'),
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
      players: tablePlayerMap.get(Number(row.id)) || [],
    })),
  }
}

function registerTournamentHandlers() {
  ipcMain.handle('tournaments:list', () => {
    const db = getDb()

    const rows = db.prepare(`
      SELECT
        t.id,
        t.name,
        t.game_type,
        t.season,
        t.status,
        t.notes,
        t.completed_at,
        t.created_at,
        t.updated_at,
        COALESCE(COUNT(tp.id), 0) as players_count
      FROM tournaments t
      LEFT JOIN tournament_players tp ON tp.tournament_id = t.id
      GROUP BY t.id, t.name, t.game_type, t.season, t.status, t.notes, t.completed_at, t.created_at, t.updated_at
      ORDER BY t.created_at DESC, t.id DESC
    `).all()

    return (rows || []).map((row) => ({
      id: Number(row.id),
      name: String(row.name || ''),
      gameType: String(row.game_type || ''),
      season: String(row.season || ''),
      status: String(row.status || 'draft'),
      notes: String(row.notes || ''),
      completedAt: String(row.completed_at || ''),
      playersCount: Number(row.players_count || 0),
      createdAt: String(row.created_at || ''),
      updatedAt: String(row.updated_at || ''),
    }))
  })

  ipcMain.handle('tournaments:create', (event, payload) => {
    const db = getDb()

    const name = normalizeText(payload?.name)
    const gameType = normalizeText(payload?.gameType)
    const season = normalizeText(payload?.season)
    const notes = normalizeText(payload?.notes)

    if (!name) {
      throw new Error('El nombre del torneo es obligatorio.')
    }

    const result = db.prepare(`
      INSERT INTO tournaments (
        name,
        game_type,
        season,
        status,
        notes,
        updated_at
      ) VALUES (?, ?, ?, 'draft', ?, CURRENT_TIMESTAMP)
    `).run(name, gameType, season, notes)

    return getTournamentDetail(db, Number(result.lastInsertRowid))
  })

  ipcMain.handle('tournaments:getDetail', (event, tournamentId) => {
    const db = getDb()
    const id = toInt(tournamentId)

    if (!id) {
      throw new Error('ID de torneo invalido.')
    }

    return getTournamentDetail(db, id)
  })

  ipcMain.handle('tournaments:update', (event, payload) => {
    const db = getDb()
    const tournamentId = toInt(payload?.id)

    if (!tournamentId) {
      throw new Error('ID de torneo invalido.')
    }

    const name = normalizeText(payload?.name)
    const gameType = normalizeText(payload?.gameType)
    const season = normalizeText(payload?.season)
    const status = normalizeText(payload?.status, 'draft')
    const notes = normalizeText(payload?.notes)

    if (!name) {
      throw new Error('El nombre del torneo es obligatorio.')
    }

    db.prepare(`
      UPDATE tournaments
      SET
        name = ?,
        game_type = ?,
        season = ?,
        status = ?,
        notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, gameType, season, status || 'draft', notes, tournamentId)

    return getTournamentDetail(db, tournamentId)
  })

  ipcMain.handle('tournaments:addPlayer', (event, payload) => {
    const db = getDb()

    const tournamentId = toInt(payload?.tournamentId)
    const customerId = payload?.customerId ? toInt(payload.customerId) : null
    const displayName = normalizeText(payload?.displayName)

    if (!tournamentId) {
      throw new Error('ID de torneo invalido.')
    }

    let playerName = displayName

    if (!playerName && customerId) {
      const customer = db.prepare(`
        SELECT id, name
        FROM customers
        WHERE id = ?
        LIMIT 1
      `).get(customerId)

      if (!customer) {
        throw new Error('Cliente no encontrado para inscribir al torneo.')
      }

      playerName = String(customer.name || '').trim()
    }

    if (!playerName) {
      throw new Error('Debes indicar un nombre de jugador.')
    }

    if (customerId) {
      const duplicated = db.prepare(`
        SELECT id
        FROM tournament_players
        WHERE tournament_id = ? AND customer_id = ?
        LIMIT 1
      `).get(tournamentId, customerId)

      if (duplicated) {
        throw new Error('Este cliente ya esta inscrito en el torneo.')
      }
    }

    const maxSeed = db.prepare(`
      SELECT COALESCE(MAX(seed), 0) as max_seed
      FROM tournament_players
      WHERE tournament_id = ?
    `).get(tournamentId)

    db.prepare(`
      INSERT INTO tournament_players (
        tournament_id,
        customer_id,
        display_name,
        seed
      ) VALUES (?, ?, ?, ?)
    `).run(
      tournamentId,
      customerId || null,
      playerName,
      Number(maxSeed?.max_seed || 0) + 1
    )

    db.prepare(`
      UPDATE tournaments
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(tournamentId)

    return getTournamentDetail(db, tournamentId)
  })

  ipcMain.handle('tournaments:removePlayer', (event, payload) => {
    const db = getDb()

    const tournamentId = toInt(payload?.tournamentId)
    const tournamentPlayerId = toInt(payload?.tournamentPlayerId)

    if (!tournamentId || !tournamentPlayerId) {
      throw new Error('Parametros invalidos para eliminar jugador.')
    }

    db.prepare(`
      DELETE FROM tournament_players
      WHERE id = ? AND tournament_id = ?
    `).run(tournamentPlayerId, tournamentId)

    db.prepare(`
      UPDATE tournaments
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(tournamentId)

    return getTournamentDetail(db, tournamentId)
  })

  ipcMain.handle('tournaments:setPlayerPlace', (event, payload) => {
    const db = getDb()

    const tournamentId = toInt(payload?.tournamentId)
    const tournamentPlayerId = toInt(payload?.tournamentPlayerId)
    const finalPlace = payload?.finalPlace ? toInt(payload.finalPlace) : null

    if (!tournamentId || !tournamentPlayerId) {
      throw new Error('Parametros invalidos para asignar lugar.')
    }

    db.prepare(`
      UPDATE tournament_players
      SET final_place = ?
      WHERE id = ? AND tournament_id = ?
    `).run(finalPlace, tournamentPlayerId, tournamentId)

    db.prepare(`
      UPDATE tournaments
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(tournamentId)

    return getTournamentDetail(db, tournamentId)
  })

  ipcMain.handle('tournaments:createRoundTables', (event, payload) => {
    const db = getDb()

    const tournamentId = toInt(payload?.tournamentId)
    const roundNumber = Math.max(toInt(payload?.roundNumber, 1), 1)
    const tableSize = Math.max(Math.min(toInt(payload?.tableSize, 2), 4), 2)
    const tableCount = Math.max(toInt(payload?.tableCount, 0), 0)

    if (!tournamentId) {
      throw new Error('ID de torneo invalido.')
    }

    const players = db.prepare(`
      SELECT
        id,
        display_name,
        seed,
        final_place,
        points,
        wins,
        losses,
        draws
      FROM tournament_players
      WHERE tournament_id = ?
      ORDER BY seed ASC, id ASC
    `).all(tournamentId)

    const availablePlayers = (players || []).filter((player) => !player.final_place)

    if (availablePlayers.length < 2) {
      throw new Error('Se requieren al menos 2 jugadores activos para asignar mesas.')
    }

    const hasRound = db.prepare(`
      SELECT id
      FROM tournament_tables
      WHERE tournament_id = ? AND round_number = ?
      LIMIT 1
    `).get(tournamentId, roundNumber)

    if (hasRound) {
      throw new Error('Ya existen mesas para esta ronda. Usa otro numero de ronda.')
    }

    const pairRows = db.prepare(`
      SELECT
        a.tournament_player_id as p1,
        b.tournament_player_id as p2
      FROM tournament_table_players a
      INNER JOIN tournament_table_players b ON b.table_id = a.table_id AND b.id > a.id
      INNER JOIN tournament_tables tt ON tt.id = a.table_id
      WHERE tt.tournament_id = ?
    `).all(tournamentId)

    const pairHistory = new Set((pairRows || []).map((row) => pairKey(row.p1, row.p2)))

    const tieBreaker = () => Math.random() - 0.5

    let orderedPlayers = []

    if (roundNumber === 1) {
      orderedPlayers = randomShuffle(availablePlayers)
    } else {
      orderedPlayers = [...availablePlayers].sort((a, b) => {
        if (Number(b.points || 0) !== Number(a.points || 0)) return Number(b.points || 0) - Number(a.points || 0)
        if (Number(b.wins || 0) !== Number(a.wins || 0)) return Number(b.wins || 0) - Number(a.wins || 0)
        if (Number(a.losses || 0) !== Number(b.losses || 0)) return Number(a.losses || 0) - Number(b.losses || 0)
        if (Number(b.draws || 0) !== Number(a.draws || 0)) return Number(b.draws || 0) - Number(a.draws || 0)
        return tieBreaker()
      })
    }

    if (tableSize === 2 && orderedPlayers.length > 2) {
      const pool = [...orderedPlayers]
      const sequence = []

      while (pool.length > 1) {
        const first = pool.shift()
        let opponentIndex = pool.findIndex((candidate) => !pairHistory.has(pairKey(first.id, candidate.id)))
        if (opponentIndex < 0) opponentIndex = 0

        const second = pool.splice(opponentIndex, 1)[0]
        sequence.push(first, second)
      }

      if (pool.length) {
        sequence.push(pool[0])
      }

      orderedPlayers = sequence
    }

    const chunks = buildTableChunks(orderedPlayers, tableSize, tableCount)

    const insertTable = db.prepare(`
      INSERT INTO tournament_tables (
        tournament_id,
        round_number,
        table_number,
        table_size,
        status,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `)

    const insertTablePlayer = db.prepare(`
      INSERT INTO tournament_table_players (
        table_id,
        tournament_player_id,
        seat,
        score,
        is_winner
      ) VALUES (?, ?, ?, 0, 0)
    `)

    const transaction = db.transaction(() => {
      let tableNumber = 1

      for (const chunk of chunks) {
        const isBye = chunk.length === 1

        const tableResult = insertTable.run(
          tournamentId,
          roundNumber,
          tableNumber,
          tableSize,
          isBye ? 'completed' : 'open'
        )

        const tableId = Number(tableResult.lastInsertRowid)

        chunk.forEach((player, seatIndex) => {
          insertTablePlayer.run(tableId, Number(player.id), seatIndex + 1)
        })

        if (isBye) {
          const byePlayerId = Number(chunk[0].id)

          db.prepare(`
            UPDATE tournament_tables
            SET
              winner_player_id = ?,
              result_note = 'BYE',
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(byePlayerId, tableId)

          db.prepare(`
            UPDATE tournament_table_players
            SET
              score = 1,
              is_winner = 1
            WHERE table_id = ? AND tournament_player_id = ?
          `).run(tableId, byePlayerId)

          db.prepare(`
            UPDATE tournament_players
            SET
              points = points + 1,
              wins = wins + 1
            WHERE id = ?
          `).run(byePlayerId)
        }

        tableNumber += 1
      }

      db.prepare(`
        UPDATE tournaments
        SET status = 'active', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(tournamentId)
    })

    transaction()

    return getTournamentDetail(db, tournamentId)
  })

  ipcMain.handle('tournaments:saveTableResult', (event, payload) => {
    const db = getDb()

    const tableId = toInt(payload?.tableId)
    const winnerPlayerId = payload?.winnerPlayerId ? toInt(payload.winnerPlayerId) : null
    const resultNote = normalizeText(payload?.resultNote)
    const playerResults = Array.isArray(payload?.playerResults) ? payload.playerResults : []

    if (!tableId) {
      throw new Error('Mesa invalida.')
    }

    const table = db.prepare(`
      SELECT id, tournament_id
      FROM tournament_tables
      WHERE id = ?
      LIMIT 1
    `).get(tableId)

    if (!table) {
      throw new Error('Mesa no encontrada.')
    }

    const currentRows = db.prepare(`
      SELECT
        tournament_player_id,
        score,
        is_winner
      FROM tournament_table_players
      WHERE table_id = ?
    `).all(tableId)

    const validIds = new Set((currentRows || []).map((row) => Number(row.tournament_player_id)))

    const normalized = new Map()
    for (const row of playerResults) {
      const playerId = toInt(row?.tournamentPlayerId)
      if (!playerId || !validIds.has(playerId)) continue

      normalized.set(playerId, {
        tournamentPlayerId: playerId,
        score: toNum(row?.score, 0),
        isWinner: Boolean(row?.isWinner),
      })
    }

    if (winnerPlayerId && validIds.has(winnerPlayerId)) {
      if (!normalized.has(winnerPlayerId)) {
        normalized.set(winnerPlayerId, {
          tournamentPlayerId: winnerPlayerId,
          score: 0,
          isWinner: true,
        })
      } else {
        normalized.get(winnerPlayerId).isWinner = true
      }
    }

    const updateTable = db.prepare(`
      UPDATE tournament_tables
      SET
        winner_player_id = ?,
        result_note = ?,
        status = 'completed',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)

    const resetPlayers = db.prepare(`
      UPDATE tournament_table_players
      SET
        score = 0,
        is_winner = 0
      WHERE table_id = ?
    `)

    const updateTablePlayer = db.prepare(`
      UPDATE tournament_table_players
      SET
        score = ?,
        is_winner = ?
      WHERE table_id = ? AND tournament_player_id = ?
    `)

    const adjustTournamentPlayer = db.prepare(`
      UPDATE tournament_players
      SET
        points = points + ?,
        wins = wins + ?,
        losses = losses + ?,
        draws = draws + ?
      WHERE id = ?
    `)

    const transaction = db.transaction(() => {
      for (const current of currentRows) {
        const playerId = Number(current.tournament_player_id)
        adjustTournamentPlayer.run(
          -Number(current.score || 0),
          Number(current.is_winner || 0) === 1 ? -1 : 0,
          Number(current.is_winner || 0) === 1 ? 0 : -1,
          0,
          playerId
        )
      }

      resetPlayers.run(tableId)

      for (const playerId of validIds) {
        const row = normalized.get(playerId) || {
          tournamentPlayerId: playerId,
          score: 0,
          isWinner: false,
        }

        updateTablePlayer.run(
          Number(row.score || 0),
          row.isWinner ? 1 : 0,
          tableId,
          playerId
        )

        adjustTournamentPlayer.run(
          Number(row.score || 0),
          row.isWinner ? 1 : 0,
          row.isWinner ? 0 : 1,
          0,
          playerId
        )
      }

      updateTable.run(winnerPlayerId || null, resultNote, tableId)

      db.prepare(`
        UPDATE tournaments
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(Number(table.tournament_id))
    })

    transaction()

    return getTournamentDetail(db, Number(table.tournament_id))
  })

  ipcMain.handle('tournaments:finalize', (event, payload) => {
    const db = getDb()
    const tournamentId = toInt(payload?.tournamentId)

    if (!tournamentId) {
      throw new Error('ID de torneo invalido para finalizar.')
    }

    const pending = db.prepare(`
      SELECT COUNT(*) as total
      FROM tournament_tables
      WHERE tournament_id = ? AND status = 'open'
    `).get(tournamentId)

    if (Number(pending?.total || 0) > 0) {
      throw new Error('No puedes finalizar: hay mesas sin resultado.')
    }

    const ranking = db.prepare(`
      SELECT
        id,
        points,
        wins,
        losses,
        draws,
        seed
      FROM tournament_players
      WHERE tournament_id = ?
      ORDER BY
        points DESC,
        wins DESC,
        losses ASC,
        draws DESC,
        seed ASC,
        id ASC
    `).all(tournamentId)

    if (!ranking.length) {
      throw new Error('No hay jugadores en el torneo para finalizar.')
    }

    const updatePlace = db.prepare(`
      UPDATE tournament_players
      SET final_place = ?
      WHERE id = ? AND tournament_id = ?
    `)

    const transaction = db.transaction(() => {
      ranking.forEach((player, index) => {
        updatePlace.run(index + 1, Number(player.id), tournamentId)
      })

      db.prepare(`
        UPDATE tournaments
        SET
          status = 'finished',
          completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(tournamentId)
    })

    transaction()

    return getTournamentDetail(db, tournamentId)
  })

  ipcMain.handle('tournaments:getLeaderboard', (event, season) => {
    const db = getDb()
    const normalizedSeason = normalizeText(season)

    const whereSql = normalizedSeason
      ? `WHERE t.status = 'finished' AND t.season = ?`
      : `WHERE t.status = 'finished'`

    const rows = normalizedSeason
      ? db.prepare(`
        SELECT
          COALESCE(tp.customer_id, tp.id * -1) as player_key,
          COALESCE(c.name, tp.display_name) as player_name,
          t.season,
          COUNT(DISTINCT t.id) as tournaments_played,
          COALESCE(SUM(CASE WHEN tp.final_place = 1 THEN 1 ELSE 0 END), 0) as tournaments_won,
          COALESCE(SUM(tp.wins), 0) as matches_won,
          COALESCE(SUM(tp.losses), 0) as matches_lost,
          COALESCE(SUM(tp.draws), 0) as matches_drawn,
          COALESCE(SUM(tp.points), 0) as total_points,
          MAX(t.completed_at) as last_title_at
        FROM tournament_players tp
        INNER JOIN tournaments t ON t.id = tp.tournament_id
        LEFT JOIN customers c ON c.id = tp.customer_id
        ${whereSql}
        GROUP BY COALESCE(tp.customer_id, tp.id * -1), COALESCE(c.name, tp.display_name), t.season
        ORDER BY tournaments_won DESC, total_points DESC, matches_won DESC, matches_lost ASC
      `).all(normalizedSeason)
      : db.prepare(`
        SELECT
          COALESCE(tp.customer_id, tp.id * -1) as player_key,
          COALESCE(c.name, tp.display_name) as player_name,
          COUNT(DISTINCT t.id) as tournaments_played,
          COALESCE(SUM(CASE WHEN tp.final_place = 1 THEN 1 ELSE 0 END), 0) as tournaments_won,
          COALESCE(SUM(tp.wins), 0) as matches_won,
          COALESCE(SUM(tp.losses), 0) as matches_lost,
          COALESCE(SUM(tp.draws), 0) as matches_drawn,
          COALESCE(SUM(tp.points), 0) as total_points,
          MAX(t.completed_at) as last_title_at
        FROM tournament_players tp
        INNER JOIN tournaments t ON t.id = tp.tournament_id
        LEFT JOIN customers c ON c.id = tp.customer_id
        ${whereSql}
        GROUP BY COALESCE(tp.customer_id, tp.id * -1), COALESCE(c.name, tp.display_name)
        ORDER BY tournaments_won DESC, total_points DESC, matches_won DESC, matches_lost ASC
      `).all()

    return {
      success: true,
      season: normalizedSeason,
      players: (rows || []).map((row) => {
        const wins = Number(row.matches_won || 0)
        const losses = Number(row.matches_lost || 0)
        const draws = Number(row.matches_drawn || 0)
        const totalMatches = wins + losses + draws

        return {
          playerKey: Number(row.player_key),
          playerName: String(row.player_name || ''),
          season: String(row.season || ''),
          tournamentsPlayed: Number(row.tournaments_played || 0),
          tournamentsWon: Number(row.tournaments_won || 0),
          matchesWon: wins,
          matchesLost: losses,
          matchesDrawn: draws,
          totalPoints: Number(row.total_points || 0),
          winRate: totalMatches ? Number(((wins / totalMatches) * 100).toFixed(2)) : 0,
          lastTitleAt: String(row.last_title_at || ''),
        }
      }),
    }
  })
}

module.exports = { registerTournamentHandlers }
