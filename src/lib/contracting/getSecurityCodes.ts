/**
 * getSecurityCodes — Fetch security codes from the barrier table via edge function.
 *
 * After security_code was moved from the agents table to agent_security_codes
 * (anon-unreadable), admin pages call this to display codes. The edge function
 * reads via service_role.
 *
 * Usage:
 *   const codes = await getSecurityCodes(agents.map(a => a.id));
 *   // codes = { "uuid-1": "123456", "uuid-2": "654321", ... }
 *   agents.forEach(a => { a.security_code = codes[a.id] ?? ''; });
 */

import { PORTAL_URL, PORTAL_ANON_KEY } from '@/lib/crm';

export async function getSecurityCodes(
  agentIds: string[],
): Promise<Record<string, string>> {
  if (!PORTAL_URL || !PORTAL_ANON_KEY || agentIds.length === 0) {
    return {};
  }

  try {
    const res = await fetch(
      `${PORTAL_URL}/functions/v1/get-security-code`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${PORTAL_ANON_KEY}`,
        },
        body: JSON.stringify({ agentIds }),
      },
    );

    if (!res.ok) return {};

    const { codes } = await res.json();
    return codes ?? {};
  } catch {
    console.warn('[getSecurityCodes] Failed to fetch codes from edge function');
    return {};
  }
}
