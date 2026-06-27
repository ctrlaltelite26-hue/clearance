import { createClerkClient, verifyToken } from "@clerk/backend";

export type ClerkAuthContext = {
  subject: string;
  email: string | null;
  name: string | null;
  payload: Record<string, unknown>;
};

function getSecretKey(): string {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error("CLERK_SECRET_KEY is not set");
  return key;
}

let clerkClient: ReturnType<typeof createClerkClient> | null = null;

function getClerkClient() {
  if (!clerkClient) {
    clerkClient = createClerkClient({
      secretKey: getSecretKey(),
      publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    });
  }
  return clerkClient;
}

export function isClerkAuthEnabled(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY);
}

export async function verifyClerkToken(authorization?: string): Promise<ClerkAuthContext> {
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Missing Bearer token");
  }
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) throw new Error("Missing Bearer token");

  const payload = await verifyToken(token, {
    secretKey: getSecretKey(),
    audience: process.env.CLERK_AUDIENCE || undefined,
  });

  const subject = String(payload.sub ?? "");
  if (!subject) throw new Error("Token missing sub");

  let email: string | null =
    typeof payload.email === "string" ? payload.email : null;
  let name: string | null =
    typeof payload.name === "string" ? payload.name : null;

  if (!email || !name) {
    try {
      const user = await getClerkClient().users.getUser(subject);
      const primaryEmailId = user.primaryEmailAddressId;
      const primary = user.emailAddresses.find((e) => e.id === primaryEmailId);
      email = email ?? primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
      const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
      name = name ?? (fullName || null);
    } catch {
      // Keep claims-only auth if Clerk user lookup fails.
    }
  }

  return { subject, email, name, payload: payload as Record<string, unknown> };
}
