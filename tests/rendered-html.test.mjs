import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const html = await readFile(
    new URL("../dist/index.html", import.meta.url),
    "utf8",
  );
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

test("server-renders the simple camera-to-sticker canvas", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Sticker Canvas<\/title>/i);
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /rel="manifest"/);
  assert.match(html, /app\/main\.tsx|assets\/index-/);
  assert.doesNotMatch(html, /Add to Gallery|<span>Export<\/span>|Rich text sticker/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});
