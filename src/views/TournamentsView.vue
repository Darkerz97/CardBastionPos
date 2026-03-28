<template>
  <div class="tournaments-layout">
    <header class="top-header">
      <div>
        <h1>Torneos</h1>
        <p>Pareos, mesas, resultados, cierre y ranking por temporada</p>
      </div>
    </header>

    <section class="main-grid">
      <div class="card">
        <div class="section-title">
          <h2>Crear torneo</h2>
        </div>

        <div class="form-grid">
          <div>
            <label>Nombre</label>
            <input v-model="newTournament.name" class="input" placeholder="Torneo semanal" />
          </div>

          <div>
            <label>Juego</label>
            <input v-model="newTournament.gameType" class="input" placeholder="Pokemon, MTG, One Piece" />
          </div>

          <div>
            <label>Temporada</label>
            <input v-model="newTournament.season" class="input" placeholder="2026-S1" />
          </div>

          <div class="full">
            <label>Notas</label>
            <textarea v-model="newTournament.notes" class="textarea" placeholder="Detalles del torneo"></textarea>
          </div>
        </div>

        <button class="primary-btn" @click="handleCreateTournament">Crear torneo</button>

        <div class="section-title list-title">
          <h2>Torneos</h2>
          <span>{{ tournaments.length }}</span>
        </div>

        <div v-if="tournaments.length" class="list-box">
          <button
            v-for="t in tournaments"
            :key="t.id"
            class="list-item"
            :class="{ active: selectedTournamentId === t.id }"
            @click="selectTournament(t.id)"
          >
            <strong>{{ t.name }}</strong>
            <small>{{ t.season || 'Sin temporada' }} | {{ t.playersCount }} jugadores | {{ t.status }}</small>
          </button>
        </div>

        <div v-else class="empty">No hay torneos.</div>

        <div class="section-title list-title">
          <h2>Ranking historial</h2>
        </div>

        <div class="inline-row">
          <input v-model="leaderboardSeason" class="input" placeholder="Temporada (vacio = general)" />
          <button class="secondary-btn" @click="loadLeaderboard">Cargar</button>
        </div>

        <div v-if="leaderboard.players.length" class="list-box leaderboard-box">
          <div class="leader-row" v-for="(row, index) in leaderboard.players" :key="`${row.playerKey}-${index}`">
            <div>
              <strong>#{{ index + 1 }} {{ row.playerName }}</strong>
              <small>
                Titulos: {{ row.tournamentsWon }} | Torneos: {{ row.tournamentsPlayed }}
              </small>
            </div>
            <div class="leader-meta">
              <small>W-L-D: {{ row.matchesWon }}-{{ row.matchesLost }}-{{ row.matchesDrawn }}</small>
              <small>Puntos: {{ row.totalPoints }} | Win%: {{ row.winRate }}%</small>
            </div>
          </div>
        </div>

        <div v-else class="empty">Sin datos de ranking para ese filtro.</div>
      </div>

      <div class="card" v-if="selectedDetail?.tournament">
        <div class="section-title">
          <h2>{{ selectedDetail.tournament.name }}</h2>
          <span>{{ selectedDetail.tournament.status }}</span>
        </div>

        <div class="tournament-meta">
          <small>Temporada: {{ selectedDetail.tournament.season || 'Sin temporada' }}</small>
          <small v-if="selectedDetail.tournament.completedAt">Finalizado: {{ formatDate(selectedDetail.tournament.completedAt) }}</small>
        </div>

        <div class="split-grid">
          <div>
            <h3>Inscribir jugadores</h3>
            <input
              v-model="customerSearch"
              class="input"
              placeholder="Buscar cliente para inscribir"
              @input="handleCustomerSearch"
            />

            <div v-if="customerResults.length" class="list-box small-list">
              <button
                v-for="c in customerResults"
                :key="c.id"
                class="list-item"
                @click="addCustomerAsPlayer(c)"
              >
                <strong>{{ c.name }}</strong>
                <small>{{ c.phone || 'Sin telefono' }}</small>
              </button>
            </div>

            <div class="inline-row">
              <input v-model="manualPlayerName" class="input" placeholder="O agregar jugador manual" />
              <button class="secondary-btn" @click="addManualPlayer">Agregar</button>
            </div>
          </div>

          <div>
            <h3>Generar pareos y mesas</h3>
            <div class="inline-row three-cols">
              <div>
                <label>Ronda</label>
                <input v-model.number="roundNumber" type="number" min="1" class="input" />
              </div>
              <div>
                <label>Tamano mesa</label>
                <select v-model.number="tableSize" class="input">
                  <option :value="2">1 vs 1 (2)</option>
                  <option :value="3">Mesa de 3</option>
                  <option :value="4">Mesa de 4</option>
                </select>
              </div>
              <div>
                <label>Numero de mesas</label>
                <input v-model.number="tableCount" type="number" min="0" class="input" placeholder="Auto" />
              </div>
            </div>
            <button class="primary-btn" @click="generateRoundTables">Generar</button>
            <button class="finish-btn" @click="finalizeTournament">Finalizar torneo</button>
          </div>
        </div>

        <div class="section-title list-title">
          <h2>Jugadores</h2>
          <span>{{ selectedDetail.players.length }}</span>
        </div>

        <div v-if="selectedDetail.players.length" class="list-box players-box">
          <div class="player-row" v-for="p in selectedDetail.players" :key="p.id">
            <div>
              <strong>{{ p.displayName }}</strong>
              <small>Puntos: {{ p.points }} | W:{{ p.wins }} L:{{ p.losses }} D:{{ p.draws }}</small>
            </div>

            <div class="player-actions">
              <input
                :value="p.finalPlace || ''"
                @input="setPlayerPlace(p.id, $event.target.value)"
                type="number"
                min="1"
                class="place-input"
                placeholder="Lugar"
              />
              <button class="danger-btn" @click="removePlayer(p.id)">Quitar</button>
            </div>
          </div>
        </div>

        <div v-else class="empty">Sin jugadores inscritos.</div>

        <div class="section-title list-title">
          <h2>Mesas y resultados</h2>
          <span>{{ selectedDetail.tables.length }}</span>
        </div>

        <div v-if="selectedDetail.tables.length" class="tables-wrap">
          <div class="table-card" v-for="table in selectedDetail.tables" :key="table.id">
            <div class="table-head">
              <strong>R{{ table.roundNumber }} - Mesa {{ table.tableNumber }}</strong>
              <small>{{ table.status }}</small>
            </div>

            <div class="table-players">
              <div class="table-player" v-for="tp in table.players" :key="tp.id">
                <label>
                  <input
                    type="radio"
                    :name="`winner-${table.id}`"
                    :checked="tableResultDraft[table.id]?.winnerPlayerId === tp.tournamentPlayerId"
                    @change="markWinner(table.id, tp.tournamentPlayerId)"
                  />
                  {{ tp.displayName }}
                </label>

                <input
                  type="number"
                  class="score-input"
                  min="0"
                  step="1"
                  :value="getDraftScore(table.id, tp.tournamentPlayerId, tp.score)"
                  @input="setDraftScore(table.id, tp.tournamentPlayerId, $event.target.value)"
                  placeholder="Puntos"
                />
              </div>
            </div>

            <textarea
              class="textarea"
              :value="tableResultDraft[table.id]?.resultNote ?? table.resultNote"
              @input="setResultNote(table.id, $event.target.value)"
              placeholder="Resultado o notas de la mesa"
            ></textarea>

            <button class="secondary-btn" @click="saveTableResult(table)">Guardar resultado</button>
          </div>
        </div>

        <div v-else class="empty">Aun no hay mesas generadas.</div>
      </div>

      <div class="card" v-else>
        <div class="empty">Selecciona o crea un torneo para comenzar.</div>
      </div>
    </section>

    <div v-if="message" class="message success">{{ message }}</div>
    <div v-if="errorMessage" class="message error">{{ errorMessage }}</div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { formatDateTimeInPosTimeZone } from '../utils/datetime'

const tournaments = ref([])
const selectedTournamentId = ref(null)
const selectedDetail = ref(null)
const customerSearch = ref('')
const customerResults = ref([])
const manualPlayerName = ref('')
const roundNumber = ref(1)
const tableSize = ref(2)
const tableCount = ref(0)
const leaderboardSeason = ref('')
const leaderboard = reactive({
  players: [],
})
const message = ref('')
const errorMessage = ref('')
const tableResultDraft = ref({})

const newTournament = reactive({
  name: '',
  gameType: '',
  season: '',
  notes: '',
})

function clearMessages() {
  message.value = ''
  errorMessage.value = ''
}

function setSuccess(text) {
  clearMessages()
  message.value = text
}

function setError(error, fallback) {
  clearMessages()
  errorMessage.value = error?.message || fallback
}

function formatDate(value) {
  return formatDateTimeInPosTimeZone(value)
}

async function loadTournaments() {
  tournaments.value = await window.posAPI.getTournaments()

  if (!selectedTournamentId.value && tournaments.value.length) {
    await selectTournament(tournaments.value[0].id)
  }
}

async function loadLeaderboard() {
  const response = await window.posAPI.getTournamentLeaderboard(leaderboardSeason.value)
  leaderboard.players = response?.players || []
}

async function selectTournament(tournamentId) {
  selectedTournamentId.value = Number(tournamentId)
  selectedDetail.value = await window.posAPI.getTournamentDetail(Number(tournamentId))
  buildDraftFromTables()
}

function buildDraftFromTables() {
  const draft = {}
  const tables = selectedDetail.value?.tables || []

  for (const table of tables) {
    draft[table.id] = {
      winnerPlayerId: table.winnerPlayerId || null,
      resultNote: table.resultNote || '',
      scores: {},
    }

    for (const tp of table.players || []) {
      draft[table.id].scores[tp.tournamentPlayerId] = Number(tp.score || 0)
      if (tp.isWinner) {
        draft[table.id].winnerPlayerId = tp.tournamentPlayerId
      }
    }
  }

  tableResultDraft.value = draft
}

async function handleCreateTournament() {
  try {
    clearMessages()
    const detail = await window.posAPI.createTournament({
      name: newTournament.name,
      gameType: newTournament.gameType,
      season: newTournament.season,
      notes: newTournament.notes,
    })

    newTournament.name = ''
    newTournament.gameType = ''
    newTournament.season = ''
    newTournament.notes = ''

    await loadTournaments()
    await selectTournament(detail.tournament.id)
    await loadLeaderboard()
    setSuccess('Torneo creado correctamente.')
  } catch (error) {
    setError(error, 'No se pudo crear el torneo.')
  }
}

async function handleCustomerSearch() {
  if (!customerSearch.value.trim()) {
    customerResults.value = []
    return
  }

  customerResults.value = await window.posAPI.searchCustomers(customerSearch.value)
}

async function addCustomerAsPlayer(customer) {
  try {
    clearMessages()
    const detail = await window.posAPI.addTournamentPlayer({
      tournamentId: selectedTournamentId.value,
      customerId: Number(customer.id),
    })

    selectedDetail.value = detail
    customerSearch.value = ''
    customerResults.value = []
    setSuccess('Jugador inscrito al torneo.')
  } catch (error) {
    setError(error, 'No se pudo inscribir el cliente al torneo.')
  }
}

async function addManualPlayer() {
  try {
    clearMessages()
    const name = String(manualPlayerName.value || '').trim()
    if (!name) {
      errorMessage.value = 'Escribe un nombre de jugador manual.'
      return
    }

    const detail = await window.posAPI.addTournamentPlayer({
      tournamentId: selectedTournamentId.value,
      displayName: name,
    })

    selectedDetail.value = detail
    manualPlayerName.value = ''
    setSuccess('Jugador manual agregado.')
  } catch (error) {
    setError(error, 'No se pudo agregar el jugador manual.')
  }
}

async function removePlayer(tournamentPlayerId) {
  try {
    clearMessages()
    const detail = await window.posAPI.removeTournamentPlayer({
      tournamentId: selectedTournamentId.value,
      tournamentPlayerId: Number(tournamentPlayerId),
    })

    selectedDetail.value = detail
    setSuccess('Jugador eliminado del torneo.')
  } catch (error) {
    setError(error, 'No se pudo eliminar el jugador.')
  }
}

async function setPlayerPlace(tournamentPlayerId, value) {
  try {
    const parsed = Number(value)
    const finalPlace = Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null

    const detail = await window.posAPI.setTournamentPlayerPlace({
      tournamentId: selectedTournamentId.value,
      tournamentPlayerId: Number(tournamentPlayerId),
      finalPlace,
    })

    selectedDetail.value = detail
  } catch (error) {
    setError(error, 'No se pudo actualizar el lugar del jugador.')
  }
}

async function generateRoundTables() {
  try {
    clearMessages()
    const detail = await window.posAPI.createTournamentRoundTables({
      tournamentId: selectedTournamentId.value,
      roundNumber: Number(roundNumber.value || 1),
      tableSize: Number(tableSize.value || 2),
      tableCount: Number(tableCount.value || 0),
    })

    selectedDetail.value = detail
    buildDraftFromTables()
    setSuccess('Pareos y mesas generados correctamente.')
  } catch (error) {
    setError(error, 'No se pudieron generar los pareos de mesas.')
  }
}

async function finalizeTournament() {
  try {
    clearMessages()
    const detail = await window.posAPI.finalizeTournament({
      tournamentId: selectedTournamentId.value,
    })

    selectedDetail.value = detail
    await loadTournaments()
    await loadLeaderboard()
    setSuccess('Torneo finalizado y ranking guardado.')
  } catch (error) {
    setError(error, 'No se pudo finalizar el torneo.')
  }
}

function ensureTableDraft(tableId) {
  if (!tableResultDraft.value[tableId]) {
    tableResultDraft.value[tableId] = {
      winnerPlayerId: null,
      resultNote: '',
      scores: {},
    }
  }

  return tableResultDraft.value[tableId]
}

function markWinner(tableId, tournamentPlayerId) {
  const draft = ensureTableDraft(tableId)
  draft.winnerPlayerId = Number(tournamentPlayerId)
}

function setDraftScore(tableId, tournamentPlayerId, rawValue) {
  const draft = ensureTableDraft(tableId)
  const parsed = Number(rawValue)
  draft.scores[Number(tournamentPlayerId)] = Number.isFinite(parsed) ? parsed : 0
}

function getDraftScore(tableId, tournamentPlayerId, fallbackScore = 0) {
  const draft = tableResultDraft.value[tableId]
  if (!draft) return Number(fallbackScore || 0)

  if (draft.scores[tournamentPlayerId] === undefined) {
    return Number(fallbackScore || 0)
  }

  return Number(draft.scores[tournamentPlayerId] || 0)
}

function setResultNote(tableId, value) {
  const draft = ensureTableDraft(tableId)
  draft.resultNote = String(value || '')
}

async function saveTableResult(table) {
  try {
    clearMessages()

    const draft = ensureTableDraft(table.id)

    const playerResults = (table.players || []).map((tp) => ({
      tournamentPlayerId: Number(tp.tournamentPlayerId),
      score: Number(draft.scores[tp.tournamentPlayerId] || 0),
      isWinner: Number(draft.winnerPlayerId || 0) === Number(tp.tournamentPlayerId),
    }))

    const detail = await window.posAPI.saveTournamentTableResult({
      tableId: Number(table.id),
      winnerPlayerId: draft.winnerPlayerId ? Number(draft.winnerPlayerId) : null,
      resultNote: draft.resultNote || '',
      playerResults,
    })

    selectedDetail.value = detail
    buildDraftFromTables()
    setSuccess('Resultado de mesa guardado.')
  } catch (error) {
    setError(error, 'No se pudo guardar el resultado de la mesa.')
  }
}

onMounted(async () => {
  try {
    await loadTournaments()
    await loadLeaderboard()
  } catch (error) {
    setError(error, 'No se pudo cargar la pantalla de torneos.')
  }
})
</script>

<style scoped>
.tournaments-layout {
  min-height: 100vh;
  background: #1e1e1e;
  color: #f5f5f5;
  padding: 20px;
}

.top-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.top-header h1 {
  margin: 0;
  color: #f2b138;
}

.top-header p {
  margin: 6px 0 0 0;
  color: #bcbcbc;
}

.back-btn,
.primary-btn,
.secondary-btn,
.danger-btn,
.finish-btn {
  border: none;
  border-radius: 12px;
  padding: 12px 14px;
  font-weight: 700;
  cursor: pointer;
}

.back-btn {
  background: #f29a2e;
  color: #111;
}

.primary-btn {
  background: #2563eb;
  color: white;
}

.secondary-btn {
  background: #15803d;
  color: white;
}

.danger-btn {
  background: #b91c1c;
  color: white;
}

.finish-btn {
  width: 100%;
  margin-top: 10px;
  background: #7c3aed;
  color: white;
}

.main-grid {
  display: grid;
  grid-template-columns: 420px 1fr;
  gap: 20px;
}

.card {
  background: #232323;
  border: 1px solid #323232;
  border-radius: 18px;
  padding: 18px;
}

.section-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-title h2,
.section-title h3 {
  margin: 0;
  color: #f2b138;
}

.tournament-meta {
  margin-bottom: 12px;
  display: flex;
  justify-content: space-between;
  color: #cbd5e1;
  font-size: 13px;
}

.list-title {
  margin-top: 16px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.full {
  grid-column: 1 / -1;
}

.input,
.textarea,
.place-input,
.score-input,
select.input {
  width: 100%;
  margin-top: 6px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #3a3a3a;
  background: #2a2a2a;
  color: white;
}

.textarea {
  min-height: 80px;
  resize: vertical;
}

.split-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 14px;
}

.inline-row {
  display: flex;
  gap: 10px;
  align-items: end;
  margin-top: 10px;
}

.three-cols {
  align-items: stretch;
}

.three-cols > div {
  flex: 1;
}

.list-box {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 250px;
  overflow-y: auto;
}

.small-list {
  max-height: 180px;
}

.leaderboard-box {
  max-height: 260px;
}

.list-item {
  border: 1px solid #3a3a3a;
  background: #2c2c2c;
  color: white;
  border-radius: 10px;
  text-align: left;
  padding: 10px;
  cursor: pointer;
}

.list-item.active,
.list-item:hover {
  border-color: #f2b138;
}

.list-item small {
  display: block;
  color: #cbd5e1;
  margin-top: 3px;
}

.leader-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  background: #2d2d2d;
  border-radius: 10px;
  padding: 10px;
}

.leader-row small {
  display: block;
  margin-top: 4px;
  color: #cbd5e1;
}

.leader-meta {
  text-align: right;
}

.players-box {
  max-height: 220px;
}

.player-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  background: #2d2d2d;
  border-radius: 10px;
  padding: 10px;
}

.player-row small {
  display: block;
  margin-top: 4px;
  color: #cbd5e1;
}

.player-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.place-input {
  width: 90px;
  margin-top: 0;
}

.tables-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 460px;
  overflow-y: auto;
}

.table-card {
  background: #2d2d2d;
  border: 1px solid #3a3a3a;
  border-radius: 12px;
  padding: 12px;
}

.table-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.table-head small {
  color: #cbd5e1;
}

.table-players {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 10px;
}

.table-player {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

.score-input {
  width: 90px;
  margin-top: 0;
}

.empty {
  color: #bcbcbc;
  padding: 16px 0;
}

.message {
  margin-top: 14px;
  padding: 12px;
  border-radius: 10px;
}

.message.success {
  background: #166534;
}

.message.error {
  background: #7f1d1d;
}
</style>
