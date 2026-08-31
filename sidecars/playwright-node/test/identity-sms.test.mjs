import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

import { fillSMSCodeInput, findSMSCodePage, prepareQRIdentitySMS } from "../identity-sms.mjs";

test("QR login does not treat the unscanned login dialog's SMS form as identity verification", async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent(`
      <main>
        <section aria-label="扫码登录"><canvas width="180" height="180"></canvas></section>
        <section aria-label="验证码登录">
          <input placeholder="请输入手机号" />
          <input placeholder="请输入验证码" inputmode="numeric" />
          <button>获取验证码</button>
        </section>
      </main>
    `);

    const result = await prepareQRIdentitySMS({ context, page });

    assert.equal(result.state, "none");
    assert.equal(await page.getByPlaceholder("请输入验证码").inputValue(), "");
  } finally {
    await context.close();
    await browser.close();
  }
});

test("QR identity verification follows the newest page and clicks receive SMS by text", async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    const originalPage = await context.newPage();
    await originalPage.setContent("<main>扫码已确认</main>");
    const verificationPage = await context.newPage();
    await verificationPage.setContent(`
      <main>
        <h1>身份验证</h1>
        <div><span>接收短信验证码</span></div>
        <section id="code-slot"></section>
        <script>
          document.querySelector('span').addEventListener('click', () => {
            document.querySelector('span').parentElement.remove();
            document.querySelector('#code-slot').innerHTML = '<input placeholder="请输入短信验证码" />';
          });
        </script>
      </main>
    `);

    const result = await prepareQRIdentitySMS({ context, page: originalPage }, { timeoutMs: 2_000 });

    assert.equal(result.state, "sms_code_required");
    assert.equal(result.page, verificationPage);
    assert.equal(await verificationPage.locator("input[placeholder*='验证码']").isVisible(), true);
  } finally {
    await context.close();
    await browser.close();
  }
});

test("QR identity verification does not report SMS sent from another page's ordinary code input", async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    const loginPage = await context.newPage();
    await loginPage.setContent(`
      <main aria-label="登录">
        <input placeholder="请输入手机号" />
        <input placeholder="请输入验证码" inputmode="numeric" />
      </main>
    `);
    const verificationPage = await context.newPage();
    await verificationPage.setContent(`
      <main>
        <h1>身份验证</h1>
        <div><span>接收短信验证码</span></div>
      </main>
    `);

    const result = await prepareQRIdentitySMS(
      { context, page: loginPage },
      { timeoutMs: 50 },
    );

    assert.equal(result.state, "sms_request_pending");
    assert.equal(result.page, verificationPage);
  } finally {
    await context.close();
    await browser.close();
  }
});

test("QR identity verification clicks the foreground action before considering a same-page login code input", async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent(`
      <main>
        <section aria-label="验证码登录">
          <input placeholder="请输入手机号" />
          <input placeholder="请输入验证码" inputmode="numeric" />
        </section>
        <section aria-label="身份验证">
          <h1>身份验证</h1>
          <div><span id="receive-sms">接收短信验证码</span></div>
        </section>
        <script>
          document.querySelector('#receive-sms').addEventListener('click', () => {
            document.body.dataset.smsActionClicked = 'true';
          });
        </script>
      </main>
    `);

    const result = await prepareQRIdentitySMS({ context, page }, { timeoutMs: 50 });

    assert.equal(await page.locator("body").getAttribute("data-sms-action-clicked"), "true");
    assert.equal(result.state, "sms_request_pending");
    assert.equal(result.page, page);
  } finally {
    await context.close();
    await browser.close();
  }
});

test("QR identity verification clicks the action card when the text node itself does not activate it", async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent(`
      <main>
        <h1>身份验证</h1>
        <div id="receive-card"><span>接收短信验证码</span></div>
        <section id="code-slot"></section>
        <script>
          document.querySelector('#receive-card').addEventListener('click', (event) => {
            if (event.target !== event.currentTarget) return;
            event.currentTarget.remove();
            document.querySelector('#code-slot').innerHTML = '<input placeholder="请输入短信验证码" />';
          });
        </script>
      </main>
    `);

    const result = await prepareQRIdentitySMS({ context, page }, { timeoutMs: 500 });

    assert.equal(result.state, "sms_code_required");
    assert.equal(await page.locator("input[placeholder*='短信验证码']").isVisible(), true);
  } finally {
    await context.close();
    await browser.close();
  }
});

test("QR identity verification recognizes the sent-code page when its heading still says receive SMS code", async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent(`
      <main>
        <h1>身份验证</h1>
        <div id="receive-card"><span>接收短信验证码</span></div>
        <section id="verification-slot"></section>
        <script>
          document.querySelector('#receive-card').addEventListener('click', () => {
            document.querySelector('main').innerHTML = \`
              <h1>接收短信验证码</h1>
              <p>短信已发送至 155******14</p>
              <input placeholder="请输入验证码" />
              <button>验证</button>
            \`;
          });
        </script>
      </main>
    `);

    const result = await prepareQRIdentitySMS({ context, page }, { timeoutMs: 500 });

    assert.equal(result.state, "sms_code_required");
    assert.equal(await page.getByPlaceholder("请输入验证码").isVisible(), true);
  } finally {
    await context.close();
    await browser.close();
  }
});

test("QR identity verification clicks the send SMS wording used by Douyin", async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent(`
      <main>
        <h1>身份验证</h1>
        <div><span>发送短信验证码</span></div>
        <section id="code-slot"></section>
        <script>
          document.querySelector('span').addEventListener('click', () => {
            document.querySelector('span').parentElement.remove();
            document.querySelector('#code-slot').innerHTML = '<input placeholder="请输入短信验证码" />';
          });
        </script>
      </main>
    `);

    const result = await prepareQRIdentitySMS({ context, page }, { timeoutMs: 2_000 });

    assert.equal(result.state, "sms_code_required");
    assert.equal(await page.locator("input[placeholder*='验证码']").isVisible(), true);
  } finally {
    await context.close();
    await browser.close();
  }
});

test("QR identity verification keeps polling while the code input appears asynchronously", async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent(`
      <main>
        <h1>身份验证</h1>
        <button>发送验证码</button>
        <section id="code-slot"></section>
        <script>
          document.querySelector('button').addEventListener('click', () => {
            setTimeout(() => {
              document.querySelector('#code-slot').innerHTML = '<input placeholder="请输入验证码" />';
            }, 200);
          });
        </script>
      </main>
    `);

    const pending = await prepareQRIdentitySMS({ context, page }, { timeoutMs: 10 });
    assert.equal(pending.state, "sms_request_pending");

    const stillPending = await prepareQRIdentitySMS({ context, page }, { allowClick: false, requestPending: true });
    assert.equal(stillPending.state, "sms_request_pending");

    await page.waitForTimeout(250);
    const ready = await prepareQRIdentitySMS({ context, page }, { allowClick: false, requestPending: true });
    assert.equal(ready.state, "sms_code_required");
  } finally {
    await context.close();
    await browser.close();
  }
});

test("generic challenges remain challenges when no SMS verification action exists", async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent("<main><h1>安全验证</h1><p>请完成滑动验证</p></main>");

    const result = await prepareQRIdentitySMS({ context, page }, { timeoutMs: 100 });

    assert.equal(result.state, "challenge_required");
    assert.equal(result.page, page);
  } finally {
    await context.close();
    await browser.close();
  }
});

test("QR identity verification fills split one-time-code inputs", async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent(`<main><h1>身份验证</h1>${Array.from({ length: 6 }, (_, index) => `<input maxlength="1" inputmode="numeric" aria-label="digit-${index}" />`).join("")}</main>`);
    const input = await findSMSCodePage({ context, page });

    assert.ok(input);
    assert.equal(await fillSMSCodeInput(input, "123456"), "otp");
    assert.deepEqual(await page.locator("input").evaluateAll((items) => items.map((item) => item.value)), ["1", "2", "3", "4", "5", "6"]);
  } finally {
    await context.close();
    await browser.close();
  }
});

test("SMS code lookup prefers the sent-code input over a same-page background login input", async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent(`
      <main>
        <section aria-label="验证码登录">
          <input id="background-code" placeholder="请输入验证码" />
        </section>
        <section aria-label="接收短信验证码">
          <h1>接收短信验证码</h1>
          <p>短信已发送至 155******14</p>
          <input id="identity-code" placeholder="请输入验证码" />
        </section>
      </main>
    `);

    const input = await findSMSCodePage({ context, page });
    assert.ok(input);
    await fillSMSCodeInput(input, "123456");

    assert.equal(await page.locator("#background-code").inputValue(), "");
    assert.equal(await page.locator("#identity-code").inputValue(), "123456");
  } finally {
    await context.close();
    await browser.close();
  }
});
