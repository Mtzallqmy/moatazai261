import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const chat = await readFile(new URL("../components/chat-workspace.tsx", import.meta.url), "utf8");
const files = await readFile(new URL("../components/file-manager.tsx", import.meta.url), "utf8");
const accountFiles = await readFile(new URL("../app/(account)/account/files/page.tsx", import.meta.url), "utf8");
const accountSettings = await readFile(new URL("../app/api/v1/account/settings/route.ts", import.meta.url), "utf8");
const accountSetup = await readFile(new URL("../app/(account)/account/setup/page.tsx", import.meta.url), "utf8");
const shell = await readFile(new URL("../components/app-shell.tsx", import.meta.url), "utf8");
const personalKeys = await readFile(new URL("../components/personal-api-keys.tsx", import.meta.url), "utf8");

test("mobile chat uses an accessible mode switch instead of a native mode select", () => {
  assert.match(chat, /className="chat-mode-switch"/);
  assert.match(chat, /aria-pressed=\{mode === "chat"\}/);
  assert.match(chat, /aria-pressed=\{mode === "agent"\}/);
  assert.doesNotMatch(chat, /<label>الوضع<select/);
});

test("files page is connected to the authenticated files API", () => {
  assert.match(accountFiles, /<FileManager/);
  assert.doesNotMatch(accountFiles, /FeatureState/);
  assert.match(files, /fetch\("\/api\/v1\/files"/);
  assert.match(files, /XMLHttpRequest/);
  assert.match(files, /\/api\/v1\/files\/\$\{id\}/);
});

test("account settings are authenticated and persisted through RLS-backed tables", () => {
  assert.match(accountSettings, /getCurrentUser/);
  assert.match(accountSettings, /\.from\("profiles"\)\.update/);
  assert.match(accountSettings, /\.from\("user_settings"\)\.upsert/);
  assert.doesNotMatch(accountSettings, /createAdminClient/);
  assert.match(accountSetup, /<AccountSettings/);
  assert.doesNotMatch(accountSetup, /FeatureState/);
});

test("admin navigation is exposed only when server authorization allows it", () => {
  assert.match(shell, /!admin && canManage/);
  assert.match(shell, /href="\/admin"/);
});

test("personal provider selection avoids the mobile native select overlay", () => {
  assert.match(personalKeys, /className="provider-choice-grid"/);
  assert.match(personalKeys, /type="radio" name="providerId"/);
  assert.doesNotMatch(personalKeys, /<select name="providerId"/);
});
