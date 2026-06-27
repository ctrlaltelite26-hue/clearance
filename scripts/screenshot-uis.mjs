import { mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UI_DIR = join(ROOT, "stitch_clearance_ui_design_system");
const OUT_DIR = join(ROOT, "ui-screenshots");

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
  return results.sort();
}

mkdirSync(OUT_DIR, { recursive: true });

const files = findHtmlFiles(UI_DIR);
console.log(`Capturing ${files.length} screens → ${OUT_DIR}`);

const browser = await puppeteer.launch({
  headless: true,
  channel: "chrome",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

const page = await browser.newPage();

for (const file of files) {
  const folderName = basename(dirname(file));
  const outPath = join(OUT_DIR, `${folderName}.png`);
  const url = pathToFileURL(file).href;

  const isMobile = folderName.includes("mobile");
  await page.setViewport({
    width: isMobile ? 390 : 1440,
    height: isMobile ? 844 : 900,
    deviceScaleFactor: 2,
  });

  try {
    await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
    await page.evaluate(() => document.fonts?.ready);
    await new Promise((r) => setTimeout(r, 800));

    await page.screenshot({
      path: outPath,
      fullPage: true,
      type: "png",
    });
    console.log("✓", folderName);
  } catch (err) {
    console.error("✗", folderName, err.message);
  }
}

await browser.close();
console.log("Done.");
