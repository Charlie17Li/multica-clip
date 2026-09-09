const fs = require("node:fs");
const path = require("node:path");
const { test, expect, chromium } = require("@playwright/test");

const extensionRoot = path.resolve(__dirname, "../..");
const fixturePath = process.env.V2EX_FIXTURE_PATH || path.join(__dirname, "../fixtures/v2ex-topic.html");
const topicUrl = "https://v2ex.com/t/1236256";

test("loads the MV3 extension and extracts the V2EX topic without replies", async () => {
  const fixtureHtml = fs.readFileSync(fixturePath, "utf8");
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    args: [
      `--disable-extensions-except=${extensionRoot}`,
      `--load-extension=${extensionRoot}`
    ]
  });

  try {
    await context.route("https://v2ex.com/**", (route) => route.fulfill({ status: 204 }));
    await context.route(topicUrl, (route) => route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: fixtureHtml
    }));

    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent("serviceworker");
    expect(worker.url()).toContain("service-worker.js");

    const page = await context.newPage();
    await page.goto(topicUrl);
    await page.addScriptTag({ path: path.join(extensionRoot, "site-adapters.js") });
    const extraction = await page.evaluate(() => {
      const result = globalThis.MulticaSiteAdapters.extract(location.href, document);
      return {
        ...result,
        topicText: document.querySelector(".topic_content")?.innerText.trim(),
        firstReplyText: document.querySelector(".reply_content")?.innerText.trim()
      };
    });

    expect(extraction.adapterId).toBe("v2ex-topic");
    expect(extraction.metadata.title).toBeTruthy();
    expect(extraction.snapshot).toContain(extraction.topicText);
    expect(extraction.snapshot).not.toContain(extraction.firstReplyText);
    expect(extraction.metadata.replyCount).toBeGreaterThan(0);

    const extensionId = new URL(worker.url()).hostname;
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.waitForLoadState();
    await expect(popup.locator("#capture-button")).toBeVisible();
  } finally {
    await context.close();
  }
});
