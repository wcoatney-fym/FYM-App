import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

/**
 * provision-roster-logins — Bulk-create Supabase Auth users from agency roster data.
 *
 * Login credentials by role:
 *   Admin:   email (real) + FYM_ADMIN_DEFAULT_PASSWORD secret
 *   Manager: last name + FYM_MANAGER_DEFAULT_PASSWORD secret
 *   Agent:   last name + NPN
 *
 * For managers and agents, Supabase Auth still needs an email, so we generate
 * a synthetic one: {lastname-slug}.{agency_id_prefix}@roster.teamfym.com
 * The login page resolves "last name" → synthetic email behind the scenes.
 *
 * POST body:
 *   { agency_id: string }                    — provision logins for one agency
 *   { agency_id: string, dry_run: true }     — preview what would be created
 *   { action: 'bulk' }                       — provision all agencies
 *   { action: 'lookup', last_name: string, agency_id: string } — resolve last name → email for login
 *
 * Requires: caller must be FYM admin (except for 'lookup' which is public).
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
  username: string;
  action: 'created' | 'skipped' | 'updated' | 'error';
  reason?: string;
}

/** Generate a URL-safe slug from a name */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Build the synthetic email for a roster agent (manager/agent login) */
function buildSyntheticEmail(lastName: string, agencyId: string): string {
  const slug = toSlug(lastName);
  const prefix = agencyId.slice(0, 8);
  return `${slug}.${prefix}@roster.teamfym.com`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('APP_SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('APP_SUPABASE_SERVICE_KEY') ?? '';

    const adminPassword = Deno.env.get('FYM_ADMIN_DEFAULT_PASSWORD') ?? '';
    const managerPassword = Deno.env.get('FYM_MANAGER_DEFAULT_PASSWORD') ?? '';

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    const { action } = body;

    // ── Public lookup: resolve last name → synthetic email for login ──
    if (action === 'lookup') {
      const { last_name, agency_id } = body;
      if (!last_name?.trim() || !agency_id?.trim()) {
        return errorResponse(400, 'last_name and agency_id required');
      }

      // Find matching active roster agent
      const { data: matches, error: lookupErr } = await supabaseAdmin
        .from('agency_rosters')
        .select('id, first_name, last_name, email, role, agent_npn')
        .eq('agency_id', agency_id)
        .eq('status', 'active')
        .ilike('last_name', last_name.trim());

      if (lookupErr) {
        return errorResponse(500, `Lookup failed: ${lookupErr.message}`);
      }

      if (!matches || matches.length === 0) {
        return errorResponse(404, 'No active agent found with that last name');
      }

      // If multiple agents share a last name, return all matches so the
      // login page can disambiguate (e.g., show first names)
      const results = matches.map((m) => ({
        id: m.id,
        first_name: m.first_name,
        last_name: m.last_name,
        role: m.role,
        // Admin uses real email; manager/agent uses synthetic
        auth_email:
          m.role === 'admin'
            ? m.email
            : buildSyntheticEmail(m.last_name, agency_id),
      }));

      return jsonResponse({ matches: results });
    }

    // ── All other actions require FYM admin auth ──
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

    const { agency_id, dry_run = false } = body;

    // ── Fetch roster agents ──
    let query = supabaseAdmin
      .from('agency_rosters')
      .select(
        'id, agency_id, first_name, last_name, email, phone, agent_npn, role, status',
      )
      .eq('status', 'active');

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
        message: 'No eligible roster agents found',
        results: [],
      });
    }

    // ── Get existing auth users for dedup ──
    const existingEmails = new Set<string>();
    const { data: { users: allUsers } } =
      await supabaseAdmin.auth.admin.listUsers();
    if (allUsers) {
      for (const u of allUsers) {
        if (u.email) existingEmails.add(u.email.toLowerCase());
      }
    }

    // ── Process each roster agent ──
    const results: ProvisionResult[] = [];

    for (const agent of rosterAgents as RosterAgent[]) {
      let authEmail: string;
      let password: string;
      let username: string;

      switch (agent.role) {
        case 'admin': {
          // Admin logs in with their real email + admin password
          const realEmail = agent.email?.trim().toLowerCase();
          if (!realEmail) {
            results.push({
              name: `${agent.first_name} ${agent.last_name}`,
              email: '',
              role: agent.role,
              username: '',
              action: 'skipped',
              reason: 'No email (required for admin login)',
            });
            continue;
          }
          if (!adminPassword) {
            results.push({
              name: `${agent.first_name} ${agent.last_name}`,
              email: realEmail,
              role: agent.role,
              username: realEmail,
              action: 'error',
              reason: 'FYM_ADMIN_DEFAULT_PASSWORD secret not set',
            });
            continue;
          }
          authEmail = realEmail;
          password = adminPassword;
          username = realEmail;
          break;
        }

        case 'manager': {
          // Manager logs in with last name + manager password
          if (!managerPassword) {
            results.push({
              name: `${agent.first_name} ${agent.last_name}`,
              email: '',
              role: agent.role,
              username: agent.last_name,
              action: 'error',
              reason: 'FYM_MANAGER_DEFAULT_PASSWORD secret not set',
            });
            continue;
          }
          authEmail = buildSyntheticEmail(agent.last_name, agent.agency_id);
          password = managerPassword;
          username = agent.last_name;
          break;
        }

        case 'agent':
        default: {
          // Agent logs in with last name + NPN
          if (!agent.agent_npn?.trim()) {
            results.push({
              name: `${agent.first_name} ${agent.last_name}`,
              email: '',
              role: agent.role,
              username: agent.last_name,
              action: 'skipped',
              reason: 'No NPN (required as agent password)',
            });
            continue;
          }
          authEmail = buildSyntheticEmail(agent.last_name, agent.agency_id);
          password = agent.agent_npn.trim();
          username = agent.last_name;
          break;
        }
      }

      // Skip if already has an auth account
      if (existingEmails.has(authEmail)) {
        results.push({
          name: `${agent.first_name} ${agent.last_name}`,
          email: authEmail,
          role: agent.role,
          username,
          action: 'skipped',
          reason: 'Auth user already exists',
        });
        continue;
      }

      if (dry_run) {
        results.push({
          name: `${agent.first_name} ${agent.last_name}`,
          email: authEmail,
          role: agent.role,
          username,
          action: 'created',
          reason: 'Dry run — would create',
        });
        existingEmails.add(authEmail);
        continue;
      }

      // ── Create auth user ──
      try {
        const {
          data: { user: newUser },
          error: createErr,
        } = await supabaseAdmin.auth.admin.createUser({
          email: authEmail,
          password,
          email_confirm: true,
        });

        if (createErr || !newUser) {
          results.push({
            name: `${agent.first_name} ${agent.last_name}`,
            email: authEmail,
            role: agent.role,
            username,
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
          results.push({
            name: fullName,
            email: authEmail,
            role: agent.role,
            username,
            action: 'error',
            reason: `User created but profile failed: ${profileErr.message}`,
          });
          continue;
        }

        existingEmails.add(authEmail);

        results.push({
          name: fullName,
          email: authEmail,
          role: agent.role,
          username,
          action: 'created',
        });
      } catch (err) {
        results.push({
          name: `${agent.first_name} ${agent.last_name}`,
          email: authEmail,
          role: agent.role,
          username,
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
