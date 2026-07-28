import * as https from 'https';

const url = 'https://zciclpvqrklutlvgcfig.supabase.co/rest/v1/';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjaWNscHZxcmtsdXRsdmdjZmlnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTIzNDQ0OSwiZXhwIjoyMTAwODEwNDQ5fQ.FFJov3oFhBrwRYFxipBECFG__rtnnHxkUlU_7EatC18';

fetch(url, {
  headers: {
    'apikey': key,
    'Authorization': `Bearer ${key}`
  }
})
.then(r => r.json())
.then(doc => {
  console.log('Tables and RPCs in PostgREST OpenAPI spec:');
  console.log(Object.keys(doc.paths || {}));
})
.catch(err => console.error('Error fetching OpenAPI spec:', err));
