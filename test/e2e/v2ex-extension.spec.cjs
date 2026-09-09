const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, expect, chromium } = require("@playwright/test");

const extensionRoot = path.resolve(__dirname, "../..");
const fixturePath = process.env.V2EX_FIXTURE_PATH || path.join(__dirname, "../fixtures/v2ex-topic.html");
const topicUrl = "https://v2ex.com/t/1236256";

function extensionWithFixtureHostAccess() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "multica-clip-e2e-"));
  fs.cpSync(extensionRoot, root, { recursive: true, filter: (source) => !source.includes(`${path.sep}node_modules`) && !source.includes(`${path.sep}.git`) });
  const manifestPath = path.join(root, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  // The production manifest remains activeTab-only. This isolated test copy
  // grants the fixture origin so Playwright can drive a side-panel document
  // without automating browser chrome's permission prompt.
  manifest.host_permissions = ["https://v2ex.com/*"];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  return root;
}

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

test("captures a confirmed, selected V2EX region through the extension UI", async () => {
  const fixtureHtml = fs.readFileSync(fixturePath, "utf8");
  const fixtureExtensionRoot = extensionWithFixtureHostAccess();
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    args: [
      `--disable-extensions-except=${fixtureExtensionRoot}`,
      `--load-extension=${fixtureExtensionRoot}`
    ]
  });

  try {
    await context.route("https://v2ex.com/**", (route) => route.fulfill({ status: 204 }));
    await context.route(topicUrl, (route) => route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: fixtureHtml
    }));
    await context.route("https://v2ex.com/api/projects?workspace_id=workspace-test", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ projects: [{ id: "project-test", title: "Fixture project" }] })
    }));
    await context.route("https://v2ex.com/api/agents?workspace_id=workspace-test", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ agents: [{ id: "agent-test", name: "Fixture agent" }] })
    }));
    let createdPayload;
    await context.route("https://v2ex.com/api/issues?workspace_id=workspace-test&allow_duplicate=true", async (route) => {
      createdPayload = route.request().postDataJSON();
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ issue: { id: "issue-test", identifier: "FIX-1" } }) });
    });

    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent("serviceworker");
    const extensionId = new URL(worker.url()).hostname;
    await worker.evaluate(() => chrome.storage.local.set({
      multicaCaptureSettings: {
        // This fixture-only endpoint, workspace and credential are all routed
        // locally; the test manifest grants only the fixture origin.
        serverUrl: "https://v2ex.com",
        accessToken: "test-only-token",
        workspaceId: "workspace-test",
        destinations: [{ domain: "v2ex.com", projectId: "project-test", agentId: "agent-test" }]
      }
    }));

    const page = await context.newPage();
    await page.goto(topicUrl);
    await page.bringToFront();
    const [activeTab] = await worker.evaluate(() => chrome.tabs.query({ active: true, currentWindow: true }));
    await worker.evaluate((tab) => chrome.storage.session.set({
      multicaSidePanelDraft: {
        tabId: tab.id,
        url: tab.url,
        projectId: "project-test",
        agentId: "agent-test",
        includeSnapshot: true
      }
    }), activeTab);
    const panel = await context.newPage();
    // Playwright exposes the extension document as a tab instead of Chrome's
    // native side-panel surface. The persisted panel draft retains the target
    // tab exactly as the service-worker initiated panel does.
    await panel.goto(`chrome-extension://${extensionId}/side-panel.html`);
    await expect(panel.locator("#page-title")).toHaveText("V2EX fixture");

    await panel.locator("#include-snapshot").check();
    await panel.locator("#select-region").click();
    await page.locator(".topic_content").hover();
    await expect(page.locator("[data-multica-region-picker]").first()).toBeVisible();
    await page.locator(".topic_content").click();
    // Regression assertion: a click locks the candidate but must not tear down
    // the picker before the user can adjust it or explicitly confirm.
    await expect(page.locator("[data-multica-region-picker]").first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-multica-region-picker]")).toHaveCount(0);
    expect(await worker.evaluate(() => chrome.storage.session.get("multicaPendingRegionDescriptor"))).toEqual({
      multicaPendingRegionDescriptor: [{ url: topicUrl, selector: "main > div:nth-of-type(2)" }]
    });
    await panel.reload();
    await expect(panel.locator("#region-list")).toContainText("div:nth-of-type(2)");

    await panel.locator("#capture-button").click();
    await expect(panel.locator("#status")).toContainText("Created FIX-1");
    expect(createdPayload.description).toContain("Fixture body");
    expect(createdPayload.description).not.toContain("Reply content must not be captured.");
    expect(createdPayload.description).toContain("collected with explicit user confirmation");
  } finally {
    await context.close();
    fs.rmSync(fixtureExtensionRoot, { recursive: true, force: true });
  }
});
