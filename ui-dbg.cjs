const puppeteer = require("puppeteer-core");
function findChrome() {
  const fs = require("fs");
  const candidates = [
    `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env["PROGRAMFILES(X86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ];
  for (const p of candidates) if (p && fs.existsSync(p)) return p;
}
(async () => {
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.on("request", (req) => {
    if (req.url().includes("messages")) console.log("REQ", req.method(), req.url());
  });
  page.on("response", (res) => {
    if (res.url().includes("messages") && res.request().method() === "POST") console.log("RES", res.status(), res.headers()["content-type"]);
  });
  await page.goto("https://tikjap.vercel.app/signup", { waitUntil: "networkidle0", timeout: 60000 });
  const email = `dbg_${Date.now()}@example.com`;
  await page.evaluate(async (em) => {
    await fetch("/api/v1/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Dbg", email: em, password: "Test-Passw0rd!42" }) });
  }, email);
  await page.goto("https://tikjap.vercel.app/chat", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('textarea[aria-label="Message"]', { timeout: 30000 });
  await page.type('textarea[aria-label="Message"]', "Hello Tikjap!");
  await page.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 10000));
  await browser.close();
})();
