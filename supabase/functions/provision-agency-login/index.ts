import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * provision-agency-login — Create FYM App login credentials for an agency.
 *
 * Creates a Supabase Auth user with a generated email ({slug}@app.teamfym.com)
 * and a custom password. Creates/updates a profile with role='admin' and
 * agency_id pointing to the agency. Stores credentials on the agencies row
 * so FYM admins can look them up in Settings.
 *
 * Accepts:
 *   POST { agency_id: string }           — provision a single agency
 *   POST { agency_id: string, password?: string } — provision with custom password
 *   POST { action: 'bulk' }              — provision all agencies without credentials
 *   POST { agency_id: string, action: 'reset', password?: string } — reset password
 *
 * Requires: caller must be an FYM admin.
 */

function generatePassword(agencyName: string): string {
  // Generate a readable but unique password: AgencyName + random 4-digit + !
  const clean = agencyName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${clean}${rand}!`;
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('APP_SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('APP_SUPABASE_SERVICE_KEY') ?? '';

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

    const body = await req.json();
    const { agency_id, action, password: customPassword } = body;

    // ── Bulk provisioning ──
    if (action === 'bulk') {
      const { data: agencies, error: agErr } = await supabaseAdmin
        .from('agencies')
        .select('id, name, slug, writing_number, app_login_email')
        .eq('is_active', true)
        .is('app_login_email', null);

      if (agErr) {
        return new Response(
          JSON.stringify({ error: `Failed to fetch agencies: ${agErr.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const results: Array<{ agency: string; status: string; email?: string }> = [];

      for (const agency of (agencies ?? [])) {
        const slug = agency.slug || toSlug(agency.name);
        const email = `${slug}@app.teamfym.com`;
        const password = generatePassword(agency.name);

        try {
          const result = await provisionSingleAgency(
            supabaseAdmin, agency.id, agency.name, slug, email, password
          );
          results.push({ agency: agency.name, status: 'provisioned', email });
        } catch (err) {
          results.push({ agency: agency.name, status: "error: provision failed" });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          action: 'bulk',
          provisioned: results.filter(r => r.status === 'provisioned').length,
          errors: results.filter(r => r.status !== 'provisioned').length,
          results,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Single agency ──
    if (!agency_id) {
      return new Response(
        JSON.stringify({ error: 'agency_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: agency, error: agErr } = await supabaseAdmin
      .from('agencies')
      .select('id, name, slug, writing_number, app_login_email, app_login_password')
      .eq('id', agency_id)
      .maybeSingle();

    if (agErr || !agency) {
      return new Response(
        JSON.stringify({ error: agErr?.message ?? 'Agency not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Password reset ──
    if (action === 'reset') {
      if (!agency.app_login_email) {
        return new Response(
          JSON.stringify({ error: 'Agency has no login credentials to reset' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const newPassword = customPassword || generatePassword(agency.name);

      // Find the auth user by email
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
      const authUser = users?.find(u => u.email === agency.app_login_email);
      if (!authUser) {
        return new Response(
          JSON.stringify({ error: `Auth user not found for ${agency.app_login_email}` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update password in auth
      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
        authUser.id,
        { password: newPassword }
      );
      if (updateErr) {
        return new Response(
          JSON.stringify({ error: `Password update failed: ${updateErr.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update stored password on agencies row
      await supabaseAdmin
        .from('agencies')
        .update({ app_login_password: newPassword, updated_at: new Date().toISOString() })
        .eq('id', agency_id);

      return new Response(
        JSON.stringify({
          success: true,
          action: 'reset',
          agency: agency.name,
          email: agency.app_login_email,
          password: newPassword,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Provision new credentials ──
    if (agency.app_login_email) {
      return new Response(
        JSON.stringify({
          error: `Agency already has credentials: ${agency.app_login_email}`,
          email: agency.app_login_email,
          password: agency.app_login_password,
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const slug = agency.slug || toSlug(agency.name);
    const email = `${slug}@app.teamfym.com`;
    const password = customPassword || generatePassword(agency.name);

    await provisionSingleAgency(supabaseAdmin, agency.id, agency.name, slug, email, password);

    return new Response(
      JSON.stringify({
        success: true,
        action: 'provisioned',
        agency: agency.name,
        email,
        password,
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

async function provisionSingleAgency(
  supabaseAdmin: ReturnType<typeof createClient>,
  agencyId: string,
  agencyName: string,
  slug: string,
  email: string,
  password: string,
): Promise<void> {
  // Check if auth user already exists with this email
  const { data: { users: existingUsers } } = await supabaseAdmin.auth.admin.listUsers();
  const existingUser = existingUsers?.find(u => u.email === email);

  let userId: string;

  if (existingUser) {
    // User exists — update password and ensure profile is correct
    userId = existingUser.id;
    await supabaseAdmin.auth.admin.updateUserById(userId, { password });
  } else {
    // Create new auth user
    const { data: { user: newUser }, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !newUser) {
      throw new Error(createErr?.message ?? 'Failed to create auth user');
    }
    userId = newUser.id;
  }

  // Upsert profile — agency admin scoped to this agency
  const { error: profileErr } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id: userId,
      role: 'admin',
      full_name: `${agencyName} Admin`,
      agency_id: agencyId,
      writing_number: null,
      npn: null,
      updated_at: new Date().toISOString(),
    });
  if (profileErr) {
    throw new Error(`Profile upsert failed: ${profileErr.message}`);
  }

  // Store credentials on the agencies row
  const { error: agErr } = await supabaseAdmin
    .from('agencies')
    .update({
      app_login_email: email,
      app_login_password: password,
      updated_at: new Date().toISOString(),
    })
    .eq('id', agencyId);
  if (agErr) {
    throw new Error(`Agency update failed: ${agErr.message}`);
  }
}
