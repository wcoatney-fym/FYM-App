/**
 * Canned messages for the contracting pipeline.
 * Sourced from Tracey & Bianca's onboarding doc.
 *
 * These are templates with merge fields ({agent_name}).
 * Used by admins via copy-to-clipboard buttons in the pipeline.
 */

export interface CannedMessage {
  id: string;
  label: string;
  stage: string;
  channel: 'slack' | 'email';
  subject?: string;
  body: string;
}

export const CANNED_MESSAGES: CannedMessage[] = [
  {
    id: 'slack_welcome',
    label: 'Slack Welcome Message',
    stage: 'iaa',
    channel: 'slack',
    body: `Welcome aboard- glad you have joined the team- Bianca and I look forward to working with you. As mentioned in our brief meeting- Once you sign the Agent agreement, we will then send you contracting links for GTL and UNL along with Bill.com and the CRM- we will also send on your behalf the contracting request for Manhattan Life, Heartland and American Home Life. While you are waiting on those, you can reach out to Bianca Bill to start training so you can have access to our training materials while you wait for your UNL RTS status. I have also attached today's meeting for your review.`,
  },
  {
    id: 'contracting_email',
    label: 'Contracting Email',
    stage: 'in_contracting',
    channel: 'email',
    subject: 'Welcome to FYM — Contracting Links & Next Steps',
    body: `Thank you for signing the independent agent agreement. In doing so, I have requested on your behalf, bill.com, which is our commission portal, The CRM request, along with carrier contracting for Manhattan Life, Heartland and American Home Life.

Below are the links for GTL and UNL- please note either carrier you will need to be RTS to test out with our trainer before you can get on the phones.

Once you complete all the contracting and submit them to the carriers, set up your bill.com and CRM- please make sure you reach out to Bianca Bill for some of the required training to keep you moving forward to your goal of being an agent on the phone.

GTL https://agentonboarding.gtlic.com/Agent/OnBoardingConsent?RecruitingAgent=Xj16faAsblomEMhHAx8H6g==&ContractCode=License%20Only%20Agent%20Contract&SpContract=0&U1=JhDIRwMfB+o=&U2=JhDIRwMfB+o=&U3=JhDIRwMfB+o=&U4=JhDIRwMfB+o=

UNL https://agentonboarding.unlinsurance.com/Agent/OnBoardingConsent?RecruitingAgent=7CJYU/PkwC4mEMhHAx8H6g==&ContractCode=License%20Only%20Agent%20Contract&SpContract=0&U1=JhDIRwMfB+o=&U2=JhDIRwMfB+o=&U3=JhDIRwMfB+o=&U4=JhDIRwMfB+o=

I have also attached our onboarding guide for your convenience to help you through the process.

Please let me know in the meantime if you should have any questions.
We look forward to working with you`,
  },
];

/**
 * Get canned messages for a specific pipeline stage.
 */
export function getMessagesForStage(stage: string): CannedMessage[] {
  return CANNED_MESSAGES.filter((m) => m.stage === stage);
}
