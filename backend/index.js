const express = require('express')
const { Pool } = require('pg')

const app = express()

const port = process.env.PORT || 4000
const databaseUrl = process.env.DATABASE_URL

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
  // eslint-disable-next-line no-console
  console.warn(
    'DATABASE_URL is not set; /api/early-access will return 500 until configured.',
  )
}

app.use(express.json())

// Simple CORS headers for the email capture endpoint (sufficient for prototype usage).
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

// Very lightweight in-memory rate limiting for the email capture endpoint.
// This is intentionally simple for the prototype and guards against bursts.
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 20
// Map<key, { count: number, windowStart: number }>
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

  const completedAtValue =
    typeof completedAt === 'string' && completedAt.length > 0
      ? completedAt
      : new Date().toISOString()

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
    return res.status(201).json({ ok: true, id: result.rows[0]?.id ?? null })
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error inserting signup', error)
    return res.status(500).json({ error: 'Failed to save signup.' })
  }
})

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on port ${port}`)
})

