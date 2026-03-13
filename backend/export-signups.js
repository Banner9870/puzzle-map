/**
 * CLI: reads signups from Postgres and prints CSV to stdout; requires DATABASE_URL.
 */
const { Pool } = require('pg')

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set; cannot export signups.')
    process.exitCode = 1
    return
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl:
      process.env.PGSSL === 'disable'
        ? false
        : { rejectUnauthorized: false },
  })

  try {
    /* Columns must match signups table and header row. */
    const result = await pool.query(
      `
        SELECT
          id,
          uuid,
          email,
          completed_at,
          created_at,
          user_agent,
          referrer,
          utm_source,
          utm_medium,
          utm_campaign
        FROM signups
        ORDER BY created_at DESC
      `,
    )

    // Output CSV header
    console.log(
      [
        'id',
        'uuid',
        'email',
        'completed_at',
        'created_at',
        'user_agent',
        'referrer',
        'utm_source',
        'utm_medium',
        'utm_campaign',
      ].join(','),
    )

    for (const row of result.rows) {
      const cells = [
        row.id,
        row.uuid,
        row.email,
        row.completed_at?.toISOString?.() ?? row.completed_at,
        row.created_at?.toISOString?.() ?? row.created_at,
        row.user_agent,
        row.referrer,
        row.utm_source,
        row.utm_medium,
        row.utm_campaign,
      ].map((value) => {
        if (value == null) return ''
        const str = String(value)
        if (/[",\n]/.test(str)) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      })
      console.log(cells.join(','))
    }
  } catch (error) {
    console.error('Failed to export signups', error)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error('Unexpected error during export', error)
  process.exitCode = 1
})

