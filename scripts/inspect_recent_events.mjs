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
    .select('id, created_by, event_type, amount, business_date, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('Error fetching events:', error.message)
    return
  }

  console.log('Most recent events:')
  console.log(JSON.stringify(events, null, 2))
}

inspect()
