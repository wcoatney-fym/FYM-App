import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

/**
 * provision-roster-logins — Bulk-create Supabase Auth users from agency roster data.
 *
 * Reads roster entries for a given agency (or all agencies) and provisions
 * auth logins based on role:
 *
 *   FYM Admin:    email from roster, password = FYM_ADMIN_DEFAULT_PASSWORD secret
 *   FYM Manager:  email from roster, password = FYM_MANAGER_DEFAULT_PASSWORD secret
 *   FYM Agent:    email from roster, password = agent's NPN
 *   Agency Admin: already handled by provision-agency-login (skipped here)
 *   Agency Mgr:   email from roster, password = FYM_MANAGER_DEFAULT_PASSWORD secret
 *   Agency Agent: email from roster, password = agent's NPN
 *
 * POST body:
 *   { agency_id: string }            — provision logins for one agency's roster
 *   { agency_id: string, dry_run: true } — preview what would be created
 *   { action: 'bulk' }               — provision all agencies
 *
 * Requires: caller must be an FYM admin.
 */

interface RosterAgent {
  id: string;
  agency_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  agent_npn: string | null;
  role: 'agent' | 'manager' | 'admin';
  status: string;
}

interface ProvisionResult {
  name: string;
  email: string;
  role: string;
  action: 'created' | 'skipped' | 'updated' | 'error';
  reason?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('APP_SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('APP_SUPABASE_SERVICE_KEY') ?? '';

    const adminPassword = Deno.env.get('FYM_ADMIN_DEFAULT_PASSWORD') ?? '';
    const managerPassword = Deno.env.get('FYM_MANAGER_DEFAULT_PASSWORD') ?? '';
    // Agent password = their NPN (no secret needed)

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── Verify caller is FYM admin ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse(401, 'Unauthorized');
    }

    const callerClient = createClient(
      supabaseUrl,
      Deno.env.get('APP_SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user: caller },
      error: callerErr,
    } = await callerClient.auth.getUser();
    if (callerErr || !caller) {
      return errorResponse(401, 'Unauthorized');
    }

    const { data: callerAdmin } = await supabaseAdmin
      .from('fym_admins')
      .select('id')
      .eq('user_id', caller.id)
      .maybeSingle();
    if (!callerAdmin) {
      return errorResponse(403, 'Forbidden — FYM admin only');
    }

    const body = await req.json();
    const { agency_id, dry_run = false, action } = body;

    // ── Fetch roster agents ──
    let query = supabaseAdmin
      .from('agency_rosters')
      .select('id, agency_id, first_name, last_name, email, phone, agent_npn, role, status')
      .eq('status', 'active')
      .not('email', 'is', null);

    if (action !== 'bulk' && agency_id) {
      query = query.eq('agency_id', agency_id);
    }

    const { data: rosterAgents, error: rosterErr } = await query;
    if (rosterErr) {
      return errorResponse(500, `Failed to fetch roster: ${rosterErr.message}`);
    }

    if (!rosterAgents || rosterAgents.length === 0) {
      return jsonResponse({
        success: true,
        message: 'No eligible roster agents found (need active status + email)',
        results: [],
      });
    }

    // ── Get existing auth users for dedup ──
    // Fetch all existing user emails to avoid duplicates
    const existingEmails = new Set<string>();
    const { data: { users: allUsers } } = await supabaseAdmin.auth.admin.listUsers();
    if (allUsers) {
      for (const u of allUsers) {
        if (u.email) existingEmails.add(u.email.toLowerCase());
      }
    }

    // ── Get agency names for profile full_name ──
    const agencyIds = [...new Set(rosterAgents.map((a) => a.agency_id))];
    const { data: agencies } = await supabaseAdmin
      .from('agencies')
      .select('id, name')
      .in('id', agencyIds);
    const agencyMap = new Map(
      (agencies ?? []).map((a) => [a.id, a.name]),
    );

    // ── Process each roster agent ──
    const results: ProvisionResult[] = [];

    for (const agent of rosterAgents as RosterAgent[]) {
      const email = agent.email?.trim().toLowerCase();
      if (!email) {
        results.push({
          name: `${agent.first_name} ${agent.last_name}`,
          email: '',
          role: agent.role,
          action: 'skipped',
          reason: 'No email',
        });
        continue;
      }

      // Skip if already has an auth account
      if (existingEmails.has(email)) {
        results.push({
          name: `${agent.first_name} ${agent.last_name}`,
          email,
          role: agent.role,
          action: 'skipped',
          reason: 'Auth user already exists',
        });
        continue;
      }

      // Determine password based on role
      let password: string;
      switch (agent.role) {
        case 'admin':
          if (!adminPassword) {
            results.push({
              name: `${agent.first_name} ${agent.last_name}`,
              email,
              role: agent.role,
              action: 'error',
              reason: 'FYM_ADMIN_DEFAULT_PASSWORD secret not set',
            });
            continue;
          }
          password = adminPassword;
          break;
        case 'manager':
          if (!managerPassword) {
            results.push({
              name: `${agent.first_name} ${agent.last_name}`,
              email,
              role: agent.role,
              action: 'error',
              reason: 'FYM_MANAGER_DEFAULT_PASSWORD secret not set',
            });
            continue;
          }
          password = managerPassword;
          break;
        case 'agent':
        default:
          if (!agent.agent_npn?.trim()) {
            results.push({
              name: `${agent.first_name} ${agent.last_name}`,
              email,
              role: agent.role,
              action: 'skipped',
              reason: 'No NPN (required as password for agents)',
            });
            continue;
          }
          password = agent.agent_npn.trim();
          break;
      }

      if (dry_run) {
        results.push({
          name: `${agent.first_name} ${agent.last_name}`,
          email,
          role: agent.role,
          action: 'created',
          reason: 'Dry run — would create',
        });
        continue;
      }

      // ── Create auth user ──
      try {
        const {
          data: { user: newUser },
          error: createErr,
        } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });

        if (createErr || !newUser) {
          results.push({
            name: `${agent.first_name} ${agent.last_name}`,
            email,
            role: agent.role,
            action: 'error',
            reason: createErr?.message ?? 'Failed to create user',
          });
          continue;
        }

        // ── Upsert profile ──
        const fullName = `${agent.first_name} ${agent.last_name}`.trim();
        const { error: profileErr } = await supabaseAdmin
          .from('profiles')
          .upsert({
            id: newUser.id,
            role: agent.role,
            full_name: fullName,
            agency_id: agent.agency_id,
            npn: agent.agent_npn || null,
            writing_number: null,
            updated_at: new Date().toISOString(),
          });

        if (profileErr) {
          // User created but profile failed — log but don't delete user
          results.push({
            name: fullName,
            email,
            role: agent.role,
            action: 'error',
            reason: `User created but profile failed: ${profileErr.message}`,
          });
          continue;
        }

        existingEmails.add(email); // Track for dedup within batch

        results.push({
          name: fullName,
          email,
          role: agent.role,
          action: 'created',
        });
      } catch (err) {
        results.push({
          name: `${agent.first_name} ${agent.last_name}`,
          email,
          role: agent.role,
          action: 'error',
          reason: String(err),
        });
      }
    }

    const created = results.filter((r) => r.action === 'created').length;
    const skipped = results.filter((r) => r.action === 'skipped').length;
    const errors = results.filter((r) => r.action === 'error').length;

    return jsonResponse({
      success: true,
      dry_run,
      summary: {
        total: results.length,
        created,
        skipped,
        errors,
      },
      results,
    });
  } catch (err) {
    return errorResponse(500, String(err));
  }
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
