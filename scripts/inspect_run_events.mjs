import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=')
    if (k && v.length) process.env[k.trim()] = v.join('=').trim()
  })
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, serviceRoleKey)

async function inspect() {
  const { data: events, error } = await supabase
    .from('events')
    .select('created_by, event_type, amount')
    .like('created_by', 'SIM-JULY-2026-%')
    .limit(5000)

  if (error) {
    console.error('Error fetching events:', error.message)
    return
  }

  const tags = {}
  for (const ev of events) {
    if (!tags[ev.created_by]) {
      tags[ev.created_by] = { count: 0, amount: 0, types: {} }
    }
    tags[ev.created_by].count++
    tags[ev.created_by].amount += ev.amount
    tags[ev.created_by].types[ev.event_type] = (tags[ev.created_by].types[ev.event_type] || 0) + 1
  }

  console.log('Found simulation runs in database (with 5000 limit):')
  console.log(JSON.stringify(tags, null, 2))
}

inspect()
