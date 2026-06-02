import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const baseUrl = (process.env.UX_AUDIT_BASE_URL ?? "https://voxora.integraretech.com.br").replace(/\/+$/, "");
const apiBaseUrl = (process.env.UX_AUDIT_API_BASE_URL ?? `${baseUrl}/api`).replace(/\/+$/, "");
const outputRoot = process.env.UX_AUDIT_OUTPUT_DIR ?? "artifacts/ux-audit";
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = join(outputRoot, runId);

const viewports = [
  { name: "desktop", width: 1440, height: 1100 },
  { name: "mobile", width: 390, height: 844 }
];

const publicPages = [
  { name: "home", path: "/" },
  { name: "login", path: "/login" },
  { name: "contact", path: "/contato" }
];

const protectedPages = [
  { name: "dashboard", path: "/dashboard" },
  { name: "transcriptions", path: "/transcricoes" },
  { name: "new-transcription", path: "/transcricoes/nova" },
  { name: "wallet", path: "/carteira" },
  { name: "support", path: "/suporte" },
  { name: "profile", path: "/perfil" }
];

async function requestJson(path, init = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} failed: ${response.status} ${text}`);
  }
  return payload;
}

async function createSession() {
  const email = `ux-audit-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`;
  return requestJson("/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "UX Audit User",
      email,
      password: "UxAudit123!"
    })
  });
}

async function loginSession() {
  const email = process.env.UX_AUDIT_EMAIL ?? "ux-audit@integraretech.com.br";
  const password = process.env.UX_AUDIT_PASSWORD ?? "UxAudit123!";

  return requestJson("/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
}

async function getAuditSession() {
  try {
    return await loginSession();
  } catch (error) {
    if (process.env.UX_AUDIT_EMAIL || process.env.UX_AUDIT_PASSWORD) {
      throw error;
    }

    return createSession();
  }
}

async function installSession(page, session) {
  await page.addInitScript((tokens) => {
    window.localStorage.setItem("voxora.session.v1", JSON.stringify(tokens));
  }, {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken
  });
}

async function collectMetrics(page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const body = document.body;
    const doc = document.documentElement;
    const horizontalOverflow = Math.max(body.scrollWidth, doc.scrollWidth) > window.innerWidth + 2;
    const buttons = [...document.querySelectorAll("button")];
    const links = [...document.querySelectorAll("a")];
    const inputs = [...document.querySelectorAll("input, textarea, select")];
    return {
      title: document.title,
      path: window.location.pathname,
      horizontalOverflow,
      bodyTextLength: body.innerText.length,
      interactiveCounts: {
        buttons: buttons.length,
        links: links.length,
        inputs: inputs.length
      },
      timings: navigation
        ? {
            domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
            loadEventMs: Math.round(navigation.loadEventEnd),
            transferSize: navigation.transferSize
          }
        : null
    };
  });
}

async function auditPage(browser, viewport, route, session) {
  const context = await browser.newContext({
    viewport,
    locale: "pt-BR",
    colorScheme: "dark",
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  const networkIssues = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleMessages.push({
        type: message.type(),
        text: message.text().slice(0, 500)
      });
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      networkIssues.push({
        status: response.status(),
        url: response.url()
      });
    }
  });
  page.on("requestfailed", (request) => {
    networkIssues.push({
      status: null,
      url: request.url(),
      failure: request.failure()?.errorText ?? "request failed"
    });
  });

  if (session) {
    await installSession(page, session);
  }

  const response = await page.goto(`${baseUrl}${route.path}`, {
    waitUntil: "networkidle",
    timeout: 45000
  });
  await page.screenshot({
    path: join(outputDir, `${viewport.name}-${route.name}.png`),
    fullPage: true
  });

  const metrics = await collectMetrics(page);
  await context.close();

  return {
    route,
    viewport: viewport.name,
    status: response?.status() ?? null,
    finalUrl: page.url(),
    metrics,
    consoleMessages,
    pageErrors,
    networkIssues
  };
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const session = await getAuditSession();
  const browser = await chromium.launch();
  const results = [];

  try {
    for (const viewport of viewports) {
      for (const route of publicPages) {
        results.push(await auditPage(browser, viewport, route, null));
      }
      for (const route of protectedPages) {
        results.push(await auditPage(browser, viewport, route, session));
      }
    }
  } finally {
    await browser.close();
  }

  const report = {
    baseUrl,
    apiBaseUrl,
    outputDir,
    generatedAt: new Date().toISOString(),
    results
  };

  await writeFile(join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    outputDir,
    pagesAudited: results.length,
    issues: results.flatMap((result) => {
      const flags = [];
      if (result.status && result.status >= 400) flags.push("http_status");
      if (result.metrics.horizontalOverflow) flags.push("horizontal_overflow");
      if (result.consoleMessages.length > 0) flags.push("console_messages");
      if (result.pageErrors.length > 0) flags.push("page_errors");
      if (result.networkIssues.length > 0) flags.push("network_issues");
      return flags.length > 0 ? [{ route: result.route.name, viewport: result.viewport, flags }] : [];
    })
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
