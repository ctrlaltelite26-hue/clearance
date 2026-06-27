export type AutomationRules = {
  autoDraftOnInbound: boolean;
  requireApprovalForAccess: boolean;
  knowledgeSearchBeforeReply: boolean;
  billingDraftOnly: boolean;
  directReplyFaqs: boolean;
  faqDirectConfidencePercent: number;
};

export const AUTOMATION_RULE_CATALOG: Array<{
  id: keyof Omit<AutomationRules, "faqDirectConfidencePercent">;
  title: string;
  description: string;
  trigger: string;
}> = [
  {
    id: "autoDraftOnInbound",
    title: "Auto-draft on inbound",
    description:
      "Analyze new threads and generate reply drafts before human review.",
    trigger: "New email received",
  },
  {
    id: "requireApprovalForAccess",
    title: "Require approval for access grants",
    description:
      "Flag risky actions like permission changes for manual sign-off.",
    trigger: "Tool: access.grant",
  },
  {
    id: "knowledgeSearchBeforeReply",
    title: "Knowledge search before reply",
    description:
      "Query your knowledge base for context before drafting responses.",
    trigger: "Before draft generation",
  },
  {
    id: "billingDraftOnly",
    title: "Auto-draft all billing queries",
    description:
      "Never auto-send replies containing invoice or payment data.",
    trigger: "Intent: billing",
  },
  {
    id: "directReplyFaqs",
    title: "Direct reply to known FAQs",
    description:
      "Auto-send only when confidence meets threshold AND a grounded knowledge base answer was found.",
    trigger: "Confidence ≥ threshold + KB match",
  },
];

export const DEFAULT_AUTOMATION_RULES: AutomationRules = {
  autoDraftOnInbound: true,
  requireApprovalForAccess: true,
  knowledgeSearchBeforeReply: true,
  billingDraftOnly: true,
  directReplyFaqs: false,
  faqDirectConfidencePercent: 95,
};
