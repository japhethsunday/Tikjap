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
  throw new Error("No Chrome/Edge");
}

function check(name, cond) {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
  if (!cond) process.exitCode = 1;
}

async function waitFor(fn, timeoutMs = 20000, interval = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, interval));
  }
  return null;
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    const email = `ui_${Date.now()}@example.com`;

    await page.goto("https://tikjap.vercel.app/signup", { waitUntil: "networkidle0", timeout: 60000 });
    const status = await page.evaluate(async (em) => {
      const res = await fetch("/api/v1/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "UI Tester", email: em, password: "Test-Passw0rd!42" }),
      });
      return res.status;
    }, email);
    check("signup via page fetch 201", status === 201);

    // Confirm session cookie actually authenticates
    const me = await page.evaluate(async () => (await fetch("/api/v1/users/me")).json());
    check("session recognized", Boolean(me?.user?.id));

    // Intelligence page: add a memory through the UI
    await page.goto("https://tikjap.vercel.app/settings/intelligence", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector('input[aria-label="New memory"]', { timeout: 30000 });
    await page.type('input[aria-label="New memory"]', "Prefers dark humor");
    await page.click('button[type="submit"]');
    const memoryShown = await waitFor(async () =>
      (await page.evaluate(() => document.body.textContent)).includes("Prefers dark humor")
    );
    check("memory appears after add", Boolean(memoryShown));

    // Sidebar tabs on /chat
    await page.goto("https://tikjap.vercel.app/chat", { waitUntil: "domcontentloaded", timeout: 60000 });
    const sidebarOk = await waitFor(async () => {
      const t = await page.evaluate(() => document.querySelector("aside")?.textContent ?? "");
      return t.includes("Pinned") && t.includes("Archived") ? t : null;
    }, 25000);
    check("sidebar shows All/Pinned/Archived tabs", Boolean(sidebarOk));

    // Send a message
    const composerSel = 'textarea[aria-label], form textarea, textarea';
    const composer = await waitFor(() => page.$(composerSel), 25000);
    check("composer available", Boolean(composer));
    if (composer) {
      await composer.type("Hello Tikjap!");
      await page.keyboard.press("Enter");
      const replied = await waitFor(
        async () => ((await page.evaluate(() => document.body.textContent)).match(/What you get|quick overview/) ? true : null),
        25000
      );
      check("assistant replied in UI", Boolean(replied));

      // Conversation menu options
      const menuBtn = await waitFor(() => page.$('[aria-label="Conversation actions"]'), 10000);
      if (menuBtn) {
        await menuBtn.click();
        const menuText = await waitFor(async () => {
          const t = await page.evaluate(() => document.body.textContent);
          return t.includes("Export as Markdown") ? t : null;
        }, 8000);
        check("pin/archive/export menu options", Boolean(menuText));
      } else {
        check("conversation menu button present", false);
      }
    }

    console.log(process.exitCode ? "\nUI TESTS FAILED" : "\nALL UI TESTS PASSED");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error("FATAL", e.message);
  process.exit(1);
});
