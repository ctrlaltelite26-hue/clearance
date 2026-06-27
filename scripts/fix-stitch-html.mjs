import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "stitch_clearance_ui_design_system");

const BRAND_TAILWIND_SNIPPET = `
                    "brand-bg": "#0B0F14",
                    "brand-surface": "#141A22",
                    "brand-border": "#243044",
                    "brand-text": "#E8EDF4",
                    "brand-muted": "#8B9CB3",
                    "brand-teal": "#2DD4BF",
                    "brand-warning": "#F59E0B",
                    "brand-danger": "#EF4444",
                    "brand-success": "#22C55E",`;

function findHtmlFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findHtmlFiles(full));
    } else if (entry === "code.html") {
      results.push(full);
    }
  }
  return results;
}

function fixHtml(content, filePath) {
  let html = content;

  // Inter → Geist
  html = html.replace(
    /@import url\('https:\/\/fonts\.googleapis\.com\/css2\?family=Inter[^']*'\);/g,
    "@import url('https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap');",
  );
  html = html.replace(/--font-geist:\s*'Inter'[^;]*;/g, "--font-geist: 'Geist', sans-serif;");
  html = html.replace(/font-family:\s*'Inter'[^;]*;/g, "font-family: 'Geist', sans-serif;");
  html = html.replace(/\["Inter"[^\]]*\]/g, '["Geist", "sans-serif"]');
  html = html.replace(/"Inter",\s*"sans-serif"/g, '"Geist", "sans-serif"');

  // Duplicate Material Symbols links (keep first occurrence per head)
  const symbolsLink =
    '<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined';
  const parts = html.split("</head>");
  if (parts.length >= 2) {
    const head = parts[0];
    const rest = parts.slice(1).join("</head>");
    const links = head.match(
      /<link[^>]*Material\+Symbols\+Outlined[^>]*>/g,
    );
    if (links && links.length > 1) {
      let first = true;
      const cleanedHead = head.replace(
        /<link[^>]*Material\+Symbols\+Outlined[^>]*>/g,
        (match) => {
          if (first) {
            first = false;
            return match;
          }
          return "";
        },
      );
      html = cleanedHead + "</head>" + rest;
    }
  }

  // Brand colors in tailwind config
  if (html.includes('"colors":') && !html.includes('"brand-bg"')) {
    html = html.replace(/"colors":\s*\{/, `"colors": {${BRAND_TAILWIND_SNIPPET}`);
  }

  // Unify primary teal
  html = html.replace(/"primary":\s*"#57f1db"/g, '"primary": "#2DD4BF"');
  html = html.replace(/#57f1db/gi, "#2DD4BF");

  // Body styles — prefer brand tokens
  html = html.replace(
    /background-color:\s*#0b0f14;/gi,
    "background-color: #0B0F14;",
  );
  html = html.replace(
    /background-color:\s*#031426;/g,
    "background-color: #0B0F14;",
  );
  html = html.replace(/color:\s*#d3e4fd;/g, "color: #E8EDF4;");

  // Landing footer year
  html = html.replace(/© 2024 Clearance/g, "© 2026 Clearance");

  // Onboarding inbox config — step & sidebar fixes
  if (filePath.includes("onboarding_step_2_inbox_config")) {
    html = html.replace("Step 2 of 3", "Step 2 of 4");
    html = html.replace('style="width: 66%;"', 'style="width: 50%;"');
    html = html.replace(
      `<div class="flex gap-2">
<div class="h-1.5 w-12 rounded-full bg-primary/20"></div>
<div class="h-1.5 w-12 rounded-full bg-primary shadow-[0_0_8px_rgba(87,241,219,0.4)]"></div>
<div class="h-1.5 w-12 rounded-full bg-surface-container-highest"></div>
</div>`,
      `<div class="flex gap-2">
<div class="h-1.5 w-12 rounded-full bg-primary/40"></div>
<div class="h-1.5 w-12 rounded-full bg-primary shadow-[0_0_8px_rgba(45,212,191,0.4)]"></div>
<div class="h-1.5 w-12 rounded-full bg-surface-container-highest"></div>
<div class="h-1.5 w-12 rounded-full bg-surface-container-highest"></div>
</div>`,
    );
    // Inbox Setup active, AI Training locked
    html = html.replace(
      `<div class="flex items-center gap-3 px-md py-2 text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-default">
<span class="material-symbols-outlined">mail</span>
<span class="font-label-md text-label-md">Inbox Setup</span>
</div>
<div class="flex items-center gap-3 px-md py-2 bg-surface-container-highest text-primary border-l-2 border-primary transition-all duration-150">
<span class="material-symbols-outlined">psychology</span>
<span class="font-label-md text-label-md">AI Training</span>
</div>`,
      `<div class="flex items-center gap-3 px-md py-2 bg-[#141A22] text-[#2DD4BF] border-l-2 border-[#2DD4BF] transition-all duration-150">
<span class="material-symbols-outlined">mail</span>
<span class="font-label-md text-label-md">Inbox Setup</span>
</div>
<div class="flex items-center gap-3 px-md py-2 text-on-surface-variant opacity-50 cursor-not-allowed">
<span class="material-symbols-outlined">psychology</span>
<span class="font-label-md text-label-md">Knowledge Base</span>
</div>`,
    );
    html = html.replace(
      `<span class="font-label-md text-label-md">Team Access</span>`,
      `<span class="font-label-md text-label-md">Review</span>`,
    );
    html = html.replace(
      `<span class="material-symbols-outlined">group</span>
<span class="font-label-md text-label-md">Review</span>`,
      `<span class="material-symbols-outlined">fact_check</span>
<span class="font-label-md text-label-md">Review</span>`,
    );
    html = html.replace(
      `<div class="flex items-center gap-3 px-md py-2 text-on-surface-variant hover:bg-surface-container-high transition-colors opacity-50 cursor-not-allowed">
<span class="material-symbols-outlined">fact_check</span>
<span class="font-label-md text-label-md">Review</span>
</div>`,
      "",
    );
    html = html.replace("shadow-2xl", "shadow-none");
    html = html.replace(
      "Connect your high-performance autopilot to a specific workspace and define handling protocols.",
      "Create a real AgentMail inbox address. People can email this address and Clearance will triage automatically.",
    );
  }

  if (filePath.includes("success_inbox_live")) {
    html = html.replace(
      `<span class="font-label-md text-label-md">AI Training</span>`,
      `<span class="font-label-md text-label-md">Knowledge Base</span>`,
    );
    html = html.replace(
      "Setup Progress: 100%",
      "Setup complete — inbox & knowledge ready",
    );
    // Remove confetti block safely
    html = html.replace(
      /<!-- Confetti\/Micro-animation Container -->[\s\S]*?id="confetti-container"[^>]*><\/div>/,
      "",
    );
    html = html.replace(
      /\/\/ Micro-interaction: Subtle particle effect on success[\s\S]*?setTimeout\(createConfetti, 300\);\s*\}\);/,
      "",
    );
  }

  // Landing — AgentMail copy
  if (filePath.includes("landing_page") || filePath.includes("deep_dive")) {
    html = html.replace(
      "Securely authorize your existing email workflow using OAuth or SMTP/IMAP credentials.",
      "Create a real inbox via AgentMail in seconds — or connect your custom domain.",
    );
    html = html.replace(
      "Connect your existing Google, Outlook, or custom SMTP support addresses in seconds. No complex migration needed.",
      "Create dedicated support addresses on AgentMail. Optional custom domain for support@yourcompany.com.",
    );
    html = html.replace(
      "Join 500+ teams using Clearance to cut response times by 85% without sacrificing the human touch.",
      "Built for support teams who want real inboxes, grounded AI drafts, and human approval when it matters.",
    );
  }

  // Policies nav — add Approvals
  if (filePath.includes("policies_governance") && !html.includes(">Approvals<")) {
    html = html.replace(
      `<!-- Nav Item: Inbox -->
<a class="flex items-center gap-sm px-md py-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors" href="#">
<span class="material-symbols-outlined">inbox</span>
<span class="text-label-md font-label-md">Inbox</span>
</a>`,
      `<!-- Nav Item: Inbox -->
<a class="flex items-center gap-sm px-md py-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors" href="#">
<span class="material-symbols-outlined">inbox</span>
<span class="text-label-md font-label-md">Inbox</span>
</a>
<a class="flex items-center gap-sm px-md py-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors" href="#">
<span class="material-symbols-outlined">fact_check</span>
<span class="text-label-md font-label-md">Approvals</span>
</a>`,
    );
  }

  // Conversation view — add Approvals to nav if missing
  if (
    filePath.includes("conversation_view") &&
    html.includes(">Settings</span>") &&
    !html.match(/Approvals[\s\S]{0,80}Settings/)
  ) {
    html = html.replace(
      `<span class="font-body-md text-body-md">Settings</span>`,
      `<span class="font-body-md text-body-md">Approvals</span>
</a>
<a class="flex items-center gap-sm px-md py-2 text-on-surface-variant hover:text-on-surface transition-colors" href="#">
<span class="material-symbols-outlined">settings</span>
<span class="font-body-md text-body-md">Settings</span>`,
    );
  }

  return html;
}

const files = findHtmlFiles(ROOT);
let fixed = 0;
for (const file of files) {
  const original = readFileSync(file, "utf8");
  const updated = fixHtml(original, file);
  if (updated !== original) {
    writeFileSync(file, updated);
    fixed++;
    console.log("fixed:", file.replace(ROOT, ""));
  }
}
console.log(`Done. ${fixed}/${files.length} files updated.`);
