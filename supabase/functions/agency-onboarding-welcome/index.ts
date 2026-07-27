import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildOnboardingEmail(params: {
  agencyName: string;
  principalName: string;
  activationUrl: string;
  portalSlug: string;
  portalPassword: string;
}) {
  const { agencyName, principalName, activationUrl, portalSlug, portalPassword } = params;

  const subject = `Welcome to FYM — ${agencyName} Onboarding`;

  const htmlBody = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a2e;">
  <div style="background: #1a1a2e; padding: 24px; border-radius: 8px 8px 0 0;">
    <h2 style="color: #ffffff; margin: 0; font-size: 20px;">FYM Financial</h2>
    <p style="color: #94a3b8; margin: 4px 0 0; font-size: 13px;">where transparency &amp; opportunity meet</p>
  </div>
  <div style="background: #f9f9f9; padding: 28px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px; color: #1a1a2e; margin-top: 0;">Hi ${principalName},</p>
    <p style="color: #374151; line-height: 1.6;">
      Welcome to FYM Financial! We're excited to have <strong>${agencyName}</strong> on board.
      Your agency activation hub is ready — everything you need to get started selling
      Hospital Indemnity and Home Health Care is in one place.
    </p>

    <div style="background: #ffffff; border: 1px solid #d1d5db; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin: 0 0 14px;">Your Agency Activation Hub</p>

      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; font-weight: bold; color: #555; width: 36%; font-size: 14px;">Activation Page</td>
          <td style="padding: 8px 0; font-size: 14px;">
            <a href="${activationUrl}" style="color: #1a56db; text-decoration: underline;">${activationUrl}</a>
          </td>
        </tr>
      </table>

      <p style="margin: 16px 0 6px; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280;">Portal Login</p>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; font-weight: bold; color: #555; font-size: 14px;">Username</td>
          <td style="padding: 8px 0; font-size: 14px; font-family: monospace; background: #f3f4f6; padding: 6px 10px; border-radius: 4px;">${portalSlug}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; font-weight: bold; color: #555; font-size: 14px;">Password</td>
          <td style="padding: 8px 0; font-size: 14px; font-family: monospace; background: #f3f4f6; padding: 6px 10px; border-radius: 4px;">${portalPassword}</td>
        </tr>
      </table>
    </div>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${activationUrl}" style="display: inline-block; background: #1a56db; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px;">
        Open Your Activation Hub →
      </a>
    </div>

    <div style="background: #fffbeb; border: 1px solid #fbbf24; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 13px; color: #92400e;">
        🔒 Keep these credentials secure. Share them only with your team members who need portal access.
      </p>
    </div>

    <p style="color: #374151; font-size: 14px; line-height: 1.6;">
      Your activation hub includes launch roadmaps, scripts, call recordings, contacts,
      and everything else you need to hit the ground running.
    </p>

    <p style="color: #374151; font-size: 14px; line-height: 1.6;">
      Questions? Reply to this email or reach us at
      <a href="mailto:will@teamfym.com" style="color: #1a1a2e;">will@teamfym.com</a>.
    </p>
    <p style="color: #374151; font-size: 14px; margin-bottom: 0;">— The FYM Team</p>
  </div>
</div>`;

  const textBody = `Hi ${principalName},

Welcome to FYM Financial! We're excited to have ${agencyName} on board.

YOUR AGENCY ACTIVATION HUB
${activationUrl}

PORTAL LOGIN
Username: ${portalSlug}
Password: ${portalPassword}

Your activation hub includes launch roadmaps, scripts, call recordings,
contacts, and everything else you need to hit the ground running.

Questions? Contact will@teamfym.com`;

  return { subject, htmlBody, textBody };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      return jsonResponse({ success: false, error: "RESEND_API_KEY not configured" }, 500);
    }

    const body = await req.json();
    const {
      agency_name,
      principal_name,
      principal_email,
      activation_url,
      portal_slug,
      portal_password,
    } = body;

    if (!agency_name || !principal_email || !activation_url) {
      return jsonResponse({
        success: false,
        error: "agency_name, principal_email, and activation_url are required",
      }, 400);
    }

    const { subject, htmlBody, textBody } = buildOnboardingEmail({
      agencyName: agency_name,
      principalName: principal_name || "there",
      activationUrl: activation_url,
      portalSlug: portal_slug || "",
      portalPassword: portal_password || "",
    });

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "FYM Activation <activation@send.teamfym.com>",
        to: [`${principal_name || agency_name} <${principal_email}>`],
        reply_to: "will@teamfym.com",
        subject,
        html: htmlBody,
        text: textBody,
        tags: [{ name: "type", value: "onboarding-welcome" }],
      }),
    });

    const resendResult = await resendRes.json();

    if (!resendRes.ok) {
      console.error("Resend error:", resendResult);
      return jsonResponse({ success: false, error: resendResult }, resendRes.status);
    }

    console.log("Onboarding welcome email sent:", resendResult.id, "→", principal_email);
    return jsonResponse({ success: true, resend_id: resendResult.id });

  } catch (err) {
    console.error("agency-onboarding-welcome error:", err);
    return jsonResponse({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }, 500);
  }
});
