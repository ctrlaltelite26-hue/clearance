function capitalize(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map(capitalize)
    .join(" ");
}

/** Parse `Display Name <user@domain.com>` or bare email. */
export function parseAgentMailAddress(value: string): {
  name: string | null;
  email: string | null;
} {
  const trimmed = value.trim().replace(/^["']|["']$/g, "");
  if (!trimmed) return { name: null, email: null };

  const named = trimmed.match(/^([^<]+)<([^>]+)>$/);
  if (named) {
    const name = named[1].trim();
    const email = named[2].trim();
    return {
      name: name && !name.includes("@") ? name : null,
      email: email.includes("@") ? email : null,
    };
  }

  if (trimmed.includes("@")) {
    return { name: null, email: trimmed };
  }

  return { name: trimmed, email: null };
}

/** Resolve sender display name from AgentMail message.from and thread.senders. */
export function parseAgentMailSender(
  from: string,
  threadSenders?: string[] | null,
): { name: string | null; email: string | null } {
  const primary = parseAgentMailAddress(from);

  if (primary.name) {
    return primary;
  }

  for (const sender of threadSenders ?? []) {
    const parsed = parseAgentMailAddress(sender);
    if (parsed.name) {
      return {
        name: parsed.name,
        email: parsed.email ?? primary.email,
      };
    }
    if (parsed.email && !primary.email) {
      return {
        name: displayNameFromEmail(parsed.email),
        email: parsed.email,
      };
    }
  }

  if (primary.email) {
    return {
      name: displayNameFromEmail(primary.email),
      email: primary.email,
    };
  }

  return { name: null, email: null };
}

/** Bare email address to reply to, parsed from an inbound From header or stored fromEmail. */
export function resolveSenderEmail(from: string | null | undefined): string | null {
  if (!from?.trim()) return null;
  const parsed = parseAgentMailAddress(from.trim());
  return parsed.email?.trim() ?? null;
}

export function emailsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a?.trim() || !b?.trim()) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** True when the sender is the support inbox itself (our outbound mail), not a customer. */
export function isInboxOwnedAddress(
  senderEmail: string | null | undefined,
  inboxAddresses: Array<string | null | undefined>,
): boolean {
  const sender = resolveSenderEmail(senderEmail);
  if (!sender) return false;
  return inboxAddresses.some((address) => emailsMatch(resolveSenderEmail(address), sender));
}

/** Pick the customer sender from AgentMail thread messages (excludes inbox address). */
export function inboundSenderFromThreadMessages(
  messages: Array<{ from: string }>,
  inboxAddresses: Array<string | null | undefined>,
): string | null {
  const blocked = new Set(
    inboxAddresses
      .map((value) => resolveSenderEmail(value))
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase()),
  );

  for (let i = messages.length - 1; i >= 0; i--) {
    const email = resolveSenderEmail(messages[i]?.from);
    if (email && !blocked.has(email.toLowerCase())) {
      return email;
    }
  }

  return null;
}

export function senderDisplayName(
  fromName?: string | null,
  fromEmail?: string | null,
): string {
  if (fromName?.trim()) return fromName.trim();

  if (fromEmail?.trim()) {
    const parsed = parseAgentMailAddress(fromEmail);
    if (parsed.name) return parsed.name;
    if (parsed.email) return displayNameFromEmail(parsed.email);
    return fromEmail.trim();
  }

  return "Unknown sender";
}
