import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const url = 'https://zciclpvqrklutlvgcfig.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjaWNscHZxcmtsdXRsdmdjZmlnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTIzNDQ0OSwiZXhwIjoyMTAwODEwNDQ5fQ.FFJov3oFhBrwRYFxipBECFG__rtnnHxkUlU_7EatC18';

const supabase = createClient(url, serviceKey);

async function run() {
  const sql = fs.readFileSync('supabase/migrations/00001_initial_schema_and_rls.sql', 'utf8');
  console.log('Testing if exec_sql or execute_sql RPC is present on database...');
  const { data: rpcData, error: rpcError } = await supabase.rpc('exec_sql', { sql_query: sql });
  console.log('RPC exec_sql result:', { rpcData, rpcError });
  if (rpcError) {
    const { data: rpcData2, error: rpcError2 } = await supabase.rpc('exec_sql', { sql: sql });
    console.log('RPC exec_sql fallback result:', { rpcData2, rpcError2 });
    const { data: rpcData3, error: rpcError3 } = await supabase.rpc('execute_sql', { sql: sql });
    console.log('RPC execute_sql result:', { rpcData3, rpcError3 });
  }
}

run();
