/**
 * Visitor-scoped persistence: cookie + localStorage for visitor id,
 * localStorage only for puzzle state (completed + lockedPieceIds).
 * Used by App and PuzzleCanvas.
 */

/** @deprecated Legacy format; we now only persist locked piece ids. New saves use only completed and lockedPieceIds; placedPieces still read for legacy. */
type StoredPieceState = {
  id: string
  currentCenterX?: number
  currentCenterY?: number
  isLocked?: boolean
}

export type PuzzleState = {
  completed: boolean
  /** Persisted: only which pieces are snapped in place. Positions recomputed on load. */
  lockedPieceIds?: string[]
  /** @deprecated Legacy; used only when loading old saves. */
  placedPieces?: StoredPieceState[]
}

/* Cookie/storage key names and cookie TTL. */
const UUID_COOKIE_NAME = 'puzzle_uuid'
const UUID_STORAGE_KEY = 'puzzle_uuid'
const PUZZLE_STATE_PREFIX = 'puzzle_state_'
const EMAIL_SUBMITTED_PREFIX = 'puzzle_email_submitted_'
const TWO_YEARS_IN_SECONDS = 60 * 60 * 24 * 365 * 2

/* Safe accessors; no-op or ignore errors in SSR or private mode. */
function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const value = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  if (!value) return null
  return decodeURIComponent(value.split('=')[1] ?? '')
}

function writeCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === 'undefined') return
  const encoded = encodeURIComponent(value)
  document.cookie = `${name}=${encoded}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax`
}

function readLocalStorage(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLocalStorage(key: string, value: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // ignore quota / privacy errors
  }
}

/* Returns null on invalid or missing JSON. */
function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/* Cookie first, then localStorage; creates new UUID if neither present; syncs both. */
export function getOrCreateVisitorId():
  | { id: string; isNew: boolean }
  | null {
  if (typeof window === 'undefined') return null

  const fromCookie = readCookie(UUID_COOKIE_NAME)
  const fromStorage = readLocalStorage(UUID_STORAGE_KEY)

  if (fromCookie || fromStorage) {
    const id = fromCookie || fromStorage
    if (id) {
      // keep cookie and localStorage in sync
      writeCookie(UUID_COOKIE_NAME, id, TWO_YEARS_IN_SECONDS)
      writeLocalStorage(UUID_STORAGE_KEY, id)
      return { id, isNew: false }
    }
  }

  let newId: string
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    newId = crypto.randomUUID()
  } else {
    newId = `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`
  }

  writeCookie(UUID_COOKIE_NAME, newId, TWO_YEARS_IN_SECONDS)
  writeLocalStorage(UUID_STORAGE_KEY, newId)

  return { id: newId, isNew: true }
}

/** Storage key for this visitor's puzzle state (used by load/save/clear). */
export function getPuzzleStateKey(visitorId: string): string {
  return `${PUZZLE_STATE_PREFIX}${visitorId}`
}

/* Load/save full PuzzleState. clearPuzzleState removes the key so next load gets null. */
export function loadPuzzleState(visitorId: string): PuzzleState | null {
  const raw = readLocalStorage(getPuzzleStateKey(visitorId))
  return safeParseJson<PuzzleState>(raw)
}

export function savePuzzleState(visitorId: string, state: PuzzleState) {
  const key = getPuzzleStateKey(visitorId)
  writeLocalStorage(key, JSON.stringify(state))
}

export function clearPuzzleState(visitorId: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(getPuzzleStateKey(visitorId))
  } catch {
    // ignore
  }
}

export function getEmailSubmitted(visitorId: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(`${EMAIL_SUBMITTED_PREFIX}${visitorId}`) === '1'
  } catch {
    return false
  }
}

export function setEmailSubmitted(visitorId: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`${EMAIL_SUBMITTED_PREFIX}${visitorId}`, '1')
  } catch {
    // ignore
  }
}

