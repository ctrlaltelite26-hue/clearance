export {
  getAgentMailClient,
  isAgentMailConfigured,
  resolveInboxEmail,
} from "./client.js";
export {
  parseAgentMailAddress,
  parseAgentMailSender,
  resolveSenderEmail,
  emailsMatch,
  isInboxOwnedAddress,
  inboundSenderFromThreadMessages,
  senderDisplayName,
  displayNameFromEmail,
} from "./address.js";
export {
  createInbox,
  getInbox,
  mapInbox,
  type CreateInboxInput,
  type CreateInboxResult,
} from "./inboxes.js";
export {
  createDraft,
  getDraft,
  mapDraft,
  sendDraft,
  updateDraft,
  isNotFoundError,
  type DraftSnapshot,
} from "./drafts.js";
export {
  getThread,
  labelThread,
  mapThread,
  type ThreadSnapshot,
} from "./threads.js";
export {
  isMessageReceivedEvent,
  parseWebhookEvent,
  registerWebhook,
  verifyWebhookPayload,
  type VerifiedWebhookEvent,
} from "./webhooks.js";
export {
  ingestAgentMailMessage,
  type IngestTrigger,
} from "./ingest.js";
export {
  shouldUseAgentMailWebSocket,
  startAgentMailWebSocketListener,
  startAgentMailIngest,
} from "./websocket.js";
export {
  formatAgentMailFrom,
  getInboundMessageSender,
} from "./messages.js";
export { resolveInboundReplyTo, type ResolveInboundReplyToInput } from "./reply-to.js";
export {
  syncAgentMailInboxes,
  maybeSyncAgentMailOnRead,
  repairQueuedAutopilotThreads,
  repairOrphanedThreadJobs,
  repairStuckAutopilotThreads,
  failStaleProcessThreadJobs,
  failStaleRunningActions,
  STALE_RUNNING_PROCESS_MS,
  type SyncResult,
} from "./sync.js";
