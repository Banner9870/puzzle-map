/**
 * Express app: health check, CORS for /api/early-access, rate limit, and POST to insert signup into Postgres.
 */
const express = require('express')
const { Pool } = require('pg')

const app = express()

const port = process.env.PORT || 4000
const databaseUrl = process.env.DATABASE_URL

/* DATABASE_URL optional; 500 on early-access if unset. */
/** @type {import('pg').Pool | null} */
let pool = null
if (databaseUrl) {
  pool = new Pool({
    connectionString: databaseUrl,
    // Railway Postgres typically requires SSL; keep this tolerant for local dev.
    ssl:
      process.env.PGSSL === 'disable'
        ? false
        : { rejectUnauthorized: false },
  })
} else {
  console.warn(
    'DATABASE_URL is not set; /api/early-access will return 500 until configured.',
  )
}

app.use(express.json())

/* Security headers for all responses. In production consider adding Content-Security-Policy if needed. */
app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  next()
})

/* Only applies to /api/early-access; ALLOWED_ORIGIN or *. In production set ALLOWED_ORIGIN to frontend origin. */
app.use((req, res, next) => {
  if (req.path === '/api/early-access' || req.path === '/api/early-access/') {
    const allowedOrigin = process.env.ALLOWED_ORIGIN || '*'
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204)
    }
  }
  next()
})

/* In-memory per key; RATE_LIMIT_MAX_REQUESTS per RATE_LIMIT_WINDOW_MS. Resets on restart; for multi-instance consider shared store (e.g. Redis). */
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 20
const rateLimitStore = new Map()

function checkRateLimit(key) {
  const now = Date.now()
  const existing = rateLimitStore.get(key)
  if (!existing || now - existing.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { count: 1, windowStart: now })
    return true
  }
  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false
  }
  existing.count += 1
  return true
}

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' })
})

/* Validate uuid and email; rate limit by ip+uuid or ip; insert signups row; return 201 or 4xx/5xx. */
app.post('/api/early-access', async (req, res) => {
  if (!pool) {
    return res
      .status(500)
      .json({ error: 'Service not configured; missing DATABASE_URL.' })
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
    req.ip ||
    'unknown'
  const uuidForRate = typeof req.body?.uuid === 'string' ? req.body.uuid : ''
  const rateKey = uuidForRate ? `${ip}:${uuidForRate}` : ip

  if (!checkRateLimit(rateKey)) {
    return res.status(429).json({ error: 'Too many requests. Please slow down.' })
  }

  const {
    uuid,
    email,
    completed_at: completedAt,
    user_agent: userAgent,
    referrer,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
  } = req.body || {}

  if (typeof uuid !== 'string' || uuid.trim().length === 0) {
    return res.status(400).json({ error: 'uuid is required.' })
  }

  if (typeof email !== 'string' || email.trim().length === 0) {
    return res.status(400).json({ error: 'email is required.' })
  }

  const emailTrimmed = email.trim()
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailPattern.test(emailTrimmed)) {
    return res.status(400).json({ error: 'email is not valid.' })
  }

  const emailNormalized = emailTrimmed.toLowerCase()

  const completedAtValue =
    typeof completedAt === 'string' && completedAt.length > 0
      ? completedAt
      : new Date().toISOString()

  // De-dup by normalized email. Use an expression-based unique index on:
  //   lower(trim(email))
  // to prevent duplicates under concurrency.
  const selectExistingText = `
    SELECT id
    FROM signups
    WHERE lower(trim(email)) = $1
    LIMIT 1
  `

  try {
    const existing = await pool.query(selectExistingText, [emailNormalized])
    const existingId = existing.rows[0]?.id ?? null
    if (existingId != null) {
      return res.status(200).json({ ok: true, id: existingId, alreadyOnList: true })
    }
  } catch (error) {
    console.error('Error checking existing signup', error)
    return res.status(500).json({ error: 'Failed to check signup.' })
  }

  const text = `
    INSERT INTO signups
      (uuid, email, completed_at, user_agent, referrer, utm_source, utm_medium, utm_campaign)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id
  `
  const values = [
    uuid.trim(),
    emailTrimmed,
    completedAtValue,
    typeof userAgent === 'string' ? userAgent : null,
    typeof referrer === 'string' ? referrer : null,
    typeof utmSource === 'string' ? utmSource : null,
    typeof utmMedium === 'string' ? utmMedium : null,
    typeof utmCampaign === 'string' ? utmCampaign : null,
  ]

  try {
    const result = await pool.query(text, values)
    return res.status(201).json({
      ok: true,
      id: result.rows[0]?.id ?? null,
      alreadyOnList: false,
    })
  } catch (error) {
    // If a concurrent insert happened, the (expression) unique index should prevent duplicates.
    // In that case, re-query and respond as already-on-the-list.
    // Postgres unique_violation is 23505.
    if (error && typeof error === 'object' && error.code === '23505') {
      try {
        const existing = await pool.query(selectExistingText, [emailNormalized])
        const existingId = existing.rows[0]?.id ?? null
        if (existingId != null) {
          return res.status(200).json({
            ok: true,
            id: existingId,
            alreadyOnList: true,
          })
        }
      } catch (requeryError) {
        console.error('Error re-querying existing signup after conflict', requeryError)
      }
    }

    console.error('Error inserting signup', error)
    return res.status(500).json({ error: 'Failed to save signup.' })
  }
})

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`)
})

