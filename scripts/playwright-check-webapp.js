/**
 * デプロイ済み Web アプリ（本番 / テスト）の表示確認用。
 *
 * 使い方:
 *   SURVEY_WEBAPP_URL='https://script.google.com/macros/s/.../exec' npm run check:survey-ui:webapp
 *
 * 前提:
 *   - URL に匿名でアクセスできること（組織内のみの場合は Playwright からは未ログインのためログイン画面になる）
 *   - フォームに複数選択（ボタン型）設問が含まれると hidden / selected の自動検証が行われる
 *
 * 確認内容（可能な範囲）:
 *   - フォーム領域の表示、デスクトップ / 375px のスクリーンショット
 *   - .button-option がある場合: 1 件クリック → field-*-hidden の値と data-value の一致
 *   - 送信でクライアント必須エラー時: alert を閉じたあと .error-message の表示と hidden 直下付近の配置
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const shotDir = path.join(__dirname, '..', 'tmp-screenshots');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  var url = process.env.SURVEY_WEBAPP_URL || process.env.WEBAPP_URL || '';
  if (!url.trim()) {
    console.error(
      'SURVEY_WEBAPP_URL（または WEBAPP_URL）が未設定です。\n' +
        '例: SURVEY_WEBAPP_URL=\'https://script.google.com/macros/s/.../exec\' npm run check:survey-ui:webapp'
    );
    process.exit(1);
  }

  fs.mkdirSync(shotDir, { recursive: true });

  var browser = await chromium.launch();
  var page = await browser.newPage();

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await new Promise(function (r) {
    setTimeout(r, 3000);
  });

  var title = await page.title();
  var u = page.url();
  if (/accounts\.google\.com/i.test(u) || /signin/i.test(title)) {
    console.warn(
      '[check:webapp] Google ログイン画面の可能性があります。組織限定デプロイの場合はブラウザで手動確認してください。'
    );
    await page.screenshot({ path: path.join(shotDir, 'webapp-login-wall.png'), fullPage: true });
    await browser.close();
    process.exit(0);
  }

  await page.waitForSelector('#main-title, #form-area, .container', { timeout: 60000 });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: path.join(shotDir, 'webapp-desktop.png'), fullPage: true });

  var hasButtons = (await page.locator('.option-button').count()) > 0;
  var group = null;
  if (hasButtons) {
    group = page.locator('.form-group:has(.button-option)').first();
    var btn = group.locator('.option-button').nth(1);
    var exists = (await btn.count()) > 0;
    if (!exists) {
      btn = group.locator('.option-button').first();
    }
    var dataVal = await btn.getAttribute('data-value');
    assert(dataVal !== null && dataVal !== undefined, 'data-value が取れません');

    await btn.click();
    await new Promise(function (r) {
      setTimeout(r, 300);
    });

    var selected = await page.locator('.option-button.selected').count();
    assert(selected >= 1, 'クリック後に .selected が付与されていること: count=' + selected);

    var hiddenVal = await group.locator('input[type="hidden"][id^="field-"][id$="-hidden"]').first().inputValue();
    assert(
      hiddenVal === dataVal,
      'hidden 値が選択と一致すること: hidden=' + JSON.stringify(hiddenVal) + ' data-value=' + JSON.stringify(dataVal)
    );

    var dirDesktop = await group.locator('.button-option').evaluate(function (el) {
      return getComputedStyle(el).flexDirection;
    });
    assert(dirDesktop === 'row', 'デスクトップで .button-option は row: ' + dirDesktop);
  } else {
    console.warn('[check:webapp] .option-button なし — ボタン型設問がないか、まだ描画前です。スクリーンショットのみ確認してください。');
  }

  if (hasButtons && group) {
    page.once('dialog', function (d) {
      d.accept();
    });
    await page.locator('#submit-button').click();
    await new Promise(function (r) {
      setTimeout(r, 500);
    });

    var pos = await group.evaluate(function (root) {
      var h = root.querySelector('input[type="hidden"][id^="field-"][id$="-hidden"]');
      var e = root.querySelector('.error-message');
      if (!h || !e) return { skip: true, reason: 'no hidden or error node' };
      var disp = e.style.display;
      if (disp !== 'block') return { skip: true, reason: 'error not shown in MC group', disp: disp };
      var hr = h.getBoundingClientRect();
      var er = e.getBoundingClientRect();
      return {
        skip: false,
        hiddenBottom: hr.bottom,
        errorTop: er.top
      };
    });
    if (pos && !pos.skip) {
      assert(pos.errorTop >= pos.hiddenBottom - 2, 'error-message が hidden より下: ' + JSON.stringify(pos));
    }
  }

  await page.setViewportSize({ width: 375, height: 900 });
  await new Promise(function (r) {
    setTimeout(r, 300);
  });
  await page.screenshot({ path: path.join(shotDir, 'webapp-375.png'), fullPage: true });

  if (hasButtons) {
    var dirMobile = await page.locator('.button-option').first().evaluate(function (el) {
      return getComputedStyle(el).flexDirection;
    });
    assert(dirMobile === 'column', '375px で .button-option は column: ' + dirMobile);
  }

  await browser.close();

  console.log('playwright-check-webapp: OK');
  console.log('  screenshots:', shotDir);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
