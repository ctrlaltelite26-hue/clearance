/** Step-scoped autopilot job types (worker pipeline). */
export const AUTOPILOT_JOB_TYPES = [
  "process_thread",
  "run_action",
  "finalize_draft",
] as const;

export type AutopilotJobType = (typeof AUTOPILOT_JOB_TYPES)[number];

export function isAutopilotJobType(type: string): type is AutopilotJobType {
  return (AUTOPILOT_JOB_TYPES as readonly string[]).includes(type);
}
