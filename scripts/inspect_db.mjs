import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read .env.local
const envContent = fs.readFileSync('.env.local', 'utf8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
}

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

console.log('Connecting to Supabase at:', supabaseUrl);
const supabase = createClient(supabaseUrl, serviceKey);

async function inspect() {
  const { data: cats, error: catErr } = await supabase.from('service_categories').select('id, slug, sort_order');
  console.log('service_categories rows:', cats?.length, 'error:', catErr?.message);
  if (cats && cats.length > 0) {
    console.log('First 5 categories in DB:', cats.slice(0, 5));
  }

  const { data: trans, error: transErr } = await supabase.from('service_category_translations').select('category_id, locale, name');
  console.log('service_category_translations rows:', trans?.length, 'error:', transErr?.message);

  const { data: locs, error: locErr } = await supabase.from('locations').select('id, level, name, parent_id');
  console.log('locations rows:', locs?.length, 'error:', locErr?.message);
  if (locs && locs.length > 0) {
    console.log('Sample locations in DB:', locs.slice(0, 5));
  }
}

inspect();
