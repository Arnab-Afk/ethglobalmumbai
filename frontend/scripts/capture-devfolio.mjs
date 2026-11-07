import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../public/devfolio");
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});

async function shot(name, url, settle = 1400) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(settle);
  await page.screenshot({ path: path.join(outDir, name), fullPage: false });
  console.log("saved", name);
}

async function pitchSlide(name, slideId, extraWait = 1000) {
  await page.goto("http://127.0.0.1:3000/pitch", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector(`[data-slide="${slideId}"]`, { timeout: 15000 });
  await page.waitForTimeout(800);

  await page.evaluate((id) => {
    document.querySelector(`[data-slide="${id}"]`)?.scrollIntoView({ behavior: "instant", block: "start" });
  }, slideId);

  // Hide recording chrome for gallery uploads
  await page.addStyleTag({
    content: `
      header.fixed { display: none !important; }
      nav[aria-label="Pitch slides"] { display: none !important; }
    `,
  });

  await page.waitForTimeout(extraWait);
  await page.screenshot({ path: path.join(outDir, name), fullPage: false });
  console.log("saved", name, slideId);
}

await shot("01-landing.png", "http://127.0.0.1:3000/", 1600);
await pitchSlide("02-pitch-title.png", "title", 700);
await pitchSlide("03-pitch-example.png", "example", 2000);
await pitchSlide("04-pitch-lp.png", "lp", 2000);

await page.goto("http://127.0.0.1:3000/swap?sell=USDC&buy=AXIS&amount=0.3", {
  waitUntil: "networkidle",
  timeout: 60000,
});
await page.waitForTimeout(4000);
await page.screenshot({ path: path.join(outDir, "05-swap.png"), fullPage: false });
console.log("saved 05-swap.png");

await shot("06-lab.png", "http://127.0.0.1:3000/lab", 1800);

await browser.close();
console.log("done", outDir);
