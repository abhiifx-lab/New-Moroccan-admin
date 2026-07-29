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
  const { data, error } = await supabase
    .from('business_days')
    .select('*')
    .like('business_date', '2026-07-%')
    .order('business_date')

  if (error) {
    console.error('Error:', error.message)
    return
  }

  console.log('Found business days:')
  console.log(data.map(d => ({ date: d.business_date, status: d.status, notes: d.closing_notes })))
}

inspect()
