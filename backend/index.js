const express = require('express')

const app = express()

const port = process.env.PORT || 4000

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' })
})

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on port ${port}`)
})

