const test = require("node:test");
const assert = require("node:assert/strict");
const { captureRequestSummary } = require("../diagnostics.js");

test("records request controls without exposing the workspace identifier", () => {
  const summary = captureRequestSummary({
    title: "Knowledge capture: Article",
    description: "source metadata",
    project_id: "project-uuid",
    assignee_type: "agent",
    assignee_id: "agent-uuid"
  }, "v2ex.com", true, { workspaceId: "workspace-secret-to-omit", allowDuplicate: true });

  assert.equal(summary.workspaceProvided, true);
  assert.equal(summary.allowDuplicate, true);
  assert.equal(summary.captureMode, "snapshot");
  assert.equal(JSON.stringify(summary).includes("workspace-secret-to-omit"), false);
});
