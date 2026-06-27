import Fastify from "fastify";

const users = [
  { email: "sarah.chen@corp.com", name: "Sarah", department: "Finance" },
  { email: "alex.rivera@corp.com", name: "Alex", department: "Engineering" },
  // Kestrel Knives demo inbox customers (fixtures/kestrel-knives-test-emails.md)
  { email: "packlite@proton.me", name: "Jordan", department: "customer" },
  { email: "maya.chen@outlook.com", name: "Maya", department: "customer" },
  { email: "jake.hunter@gmail.com", name: "Jake", department: "customer" },
  { email: "ridge.walker@icloud.com", name: "Ridge", department: "customer" },
  { email: "elena.r@company.com", name: "Elena", department: "customer" },
  { email: "buyer@testmail.com", name: "Sam", department: "customer" },
  {
    email: "morgan.wholesale@guideco.com",
    name: "Morgan",
    department: "dealer",
  },
];

type Ticket = {
  id: string;
  title: string;
  priority: string;
  caseId?: string;
  notes: string[];
};

const tickets = new Map<string, Ticket>();
let ticketCounter = 1042;

type Draft = {
  id: string;
  caseId?: string;
  ticketId?: string;
  subject: string;
  body: string;
};

const drafts: Draft[] = [];
const grants: Array<Record<string, unknown>> = [];

async function startTicketServer() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true, service: "ticket-mock" }));

  app.post("/tickets", async (request) => {
    const body = request.body as { title: string; priority: string; caseId?: string };
    const id = `INC-${ticketCounter++}`;
    const ticket: Ticket = {
      id,
      title: body.title,
      priority: body.priority,
      caseId: body.caseId,
      notes: [],
    };
    tickets.set(id, ticket);
    app.log.info({ ticket }, "ticket created");
    return ticket;
  });

  app.patch("/tickets/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ticket = tickets.get(id);
    if (!ticket) return reply.status(404).send({ error: "Not found" });
    const body = request.body as { note?: string };
    if (body.note) ticket.notes.push(body.note);
    return ticket;
  });

  await app.listen({ port: 4001, host: "0.0.0.0" });
}

async function startIdpServer() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true, service: "idp-mock" }));

  app.get("/users", async (request, reply) => {
    const { email, name } = request.query as { email?: string; name?: string };
    const user = users.find(
      (u) =>
        (email && u.email.toLowerCase() === email.toLowerCase()) ||
        (name && u.name.toLowerCase() === name.toLowerCase()),
    );
    if (!user) {
      return reply.status(404).send({ error: "User not found (mock IdP)" });
    }
    return user;
  });

  app.post("/access/proposals", async (request) => {
    const body = request.body as Record<string, unknown>;
    app.log.info({ body }, "access proposal");
    return { status: "proposed", ...body };
  });

  app.post("/access/grants", async (request) => {
    const body = request.body as Record<string, unknown>;
    grants.push(body);
    app.log.info({ body }, "access granted");
    return { status: "granted", ...body };
  });

  app.get("/access/grants", async () => grants);

  await app.listen({ port: 4002, host: "0.0.0.0" });
}

async function startNotifyServer() {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ ok: true, service: "notify-mock" }));

  app.post("/drafts", async (request) => {
    const body = request.body as {
      caseId?: string;
      ticketId?: string;
      tone?: string;
    };
    const draft: Draft = {
      id: `DRF-${drafts.length + 1}`,
      caseId: body.caseId,
      ticketId: body.ticketId,
      subject: `Re: Support request ${body.ticketId ?? ""}`.trim(),
      body: `Draft (${body.tone ?? "general"}): We are processing your request. Reference ${body.ticketId ?? "pending"}.`,
    };
    drafts.push(draft);
    app.log.info({ draft }, "draft created");
    return draft;
  });

  app.get("/drafts", async () => drafts);

  await app.listen({ port: 4003, host: "0.0.0.0" });
}

await Promise.all([startTicketServer(), startIdpServer(), startNotifyServer()]);
console.log("[mocks] ticket :4001, idp :4002, notify :4003");
