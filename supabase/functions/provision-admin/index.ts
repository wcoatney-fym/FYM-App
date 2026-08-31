import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProvisionAdminRequest {
  first_name: string;
  last_name: string;
  email: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('APP_SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('APP_SUPABASE_SERVICE_KEY') ?? '';
    const defaultPassword = Deno.env.get('FYM_ADMIN_DEFAULT_PASSWORD') ?? '';

    if (!defaultPassword) {
      return new Response(
        JSON.stringify({ error: 'FYM_ADMIN_DEFAULT_PASSWORD secret not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Service-role client — bypasses RLS, can create auth users
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify caller is authenticated + FYM admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const callerClient = createClient(
      supabaseUrl,
      Deno.env.get('APP_SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: caller }, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !caller) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check caller is FYM admin
    const { data: callerAdmin } = await supabaseAdmin
      .from('fym_admins')
      .select('id')
      .eq('user_id', caller.id)
      .maybeSingle();
    if (!callerAdmin) {
      return new Response(
        JSON.stringify({ error: 'Forbidden — FYM admin only' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: ProvisionAdminRequest = await req.json();
    const { first_name, last_name, email } = body;

    if (!first_name?.trim() || !last_name?.trim() || !email?.trim()) {
      return new Response(
        JSON.stringify({ error: 'first_name, last_name, and email are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fullName = `${first_name.trim()} ${last_name.trim()}`;
    const cleanEmail = email.trim().toLowerCase();

    // Check for existing user with this email
    const { data: { users: existingUsers } } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.find(u => u.email === cleanEmail);
    if (existingUser) {
      // User exists — check if already an FYM admin
      const { data: existingAdmin } = await supabaseAdmin
        .from('fym_admins')
        .select('id')
        .eq('user_id', existingUser.id)
        .maybeSingle();
      if (existingAdmin) {
        return new Response(
          JSON.stringify({ error: `${cleanEmail} is already an FYM admin` }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // User exists but isn't an admin — promote them
      await supabaseAdmin
        .from('profiles')
        .update({ role: 'admin', full_name: fullName, updated_at: new Date().toISOString() })
        .eq('id', existingUser.id);

      await supabaseAdmin
        .from('fym_admins')
        .insert({ user_id: existingUser.id, added_by: caller.id });

      return new Response(
        JSON.stringify({
          success: true,
          action: 'promoted',
          user_id: existingUser.id,
          email: cleanEmail,
          full_name: fullName,
          message: `${fullName} promoted to FYM admin (existing account).`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create new auth user with standard password
    const { data: { user: newUser }, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: defaultPassword,
      email_confirm: true,
    });
    if (createErr || !newUser) {
      return new Response(
        JSON.stringify({ error: createErr?.message ?? 'Failed to create user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Upsert profile as admin
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: newUser.id,
        role: 'admin',
        full_name: fullName,
        writing_number: null,
        npn: null,
        agency_id: null,
        updated_at: new Date().toISOString(),
      });
    if (profileErr) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.id);
      return new Response(
        JSON.stringify({ error: "Failed to update profile" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Add to fym_admins
    const { error: adminErr } = await supabaseAdmin
      .from('fym_admins')
      .insert({ user_id: newUser.id, added_by: caller.id });
    if (adminErr) {
      // Profile exists but fym_admins insert failed — non-fatal, log it
      console.error('fym_admins insert error (user still created):', adminErr.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        action: 'created',
        user_id: newUser.id,
        email: cleanEmail,
        full_name: fullName,
        message: `${fullName} created as FYM admin. They can log in with the standard admin password.`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
