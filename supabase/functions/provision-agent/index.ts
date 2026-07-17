import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProvisionRequest {
  email: string;
  full_name: string;
  writing_number: string;
  npn?: string;
  agency_id?: string;
  role?: 'agent' | 'manager';
  temp_password?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Service-role client — bypasses RLS, can create auth users
    const supabaseAdmin = createClient(
      Deno.env.get('APP_SUPABASE_URL') ?? '',
      Deno.env.get('APP_SUPABASE_SERVICE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller is authenticated + admin/manager
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const callerClient = createClient(
      Deno.env.get('APP_SUPABASE_URL') ?? '',
      Deno.env.get('APP_SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !caller) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles').select('role').eq('id', caller.id).single();
    if (!callerProfile || !['admin', 'manager'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden — admin or manager only' }), { status: 403, headers: corsHeaders });
    }

    const body: ProvisionRequest = await req.json();
    const { email, full_name, writing_number, npn, agency_id, role = 'agent', temp_password } = body;

    if (!email || !full_name || !writing_number) {
      return new Response(JSON.stringify({ error: 'email, full_name, writing_number required' }), { status: 400, headers: corsHeaders });
    }

    // Check for duplicate writing_number
    const { data: existing } = await supabaseAdmin
      .from('profiles').select('id, full_name').eq('writing_number', writing_number).maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({
        error: `writing_number ${writing_number} already assigned to ${existing.full_name}`
      }), { status: 409, headers: corsHeaders });
    }

    // Generate temp password if not provided
    const password = temp_password ?? `FYM${writing_number}${new Date().getFullYear()}!`;

    // Create auth user
    const { data: { user }, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // skip confirmation email — admin-created accounts are pre-confirmed
    });
    if (createErr || !user) {
      return new Response(JSON.stringify({ error: createErr?.message ?? 'Failed to create user' }), { status: 500, headers: corsHeaders });
    }

    // Upsert profile (trigger auto-creates a bare profile on user creation; we update with real data)
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: user.id,
        role,
        full_name,
        writing_number,
        npn: npn ?? null,
        agency_id: agency_id ?? null,
        updated_at: new Date().toISOString(),
      });
    if (profileErr) {
      // Clean up — delete the auth user so we don't leave orphans
      await supabaseAdmin.auth.admin.deleteUser(user.id);
      return new Response(JSON.stringify({ error: `Profile error: ${profileErr.message}` }), { status: 500, headers: corsHeaders });
    }

    // Count how many policies will link on next sync
    const { count } = await supabaseAdmin
      .from('policy_cache')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', user.id);

    return new Response(JSON.stringify({
      success: true,
      user_id: user.id,
      email,
      full_name,
      writing_number,
      role,
      temp_password: password,
      policies_will_link: count ?? 0,
      note: 'Policies link on next nightly sync (4 AM CT). Run sync-policy-cache now to link immediately.',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});
