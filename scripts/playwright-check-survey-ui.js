/**
 * フォーム UI の headless 確認（clasp push 前のレイアウト・DOM 挙動の最低限チェック）。
 * tmp-preview-survey-ui.html を生成し、file:// で開いて検証する。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const stylePath = path.join(root, 'src', 'html', 'styles.css.html');
const previewPath = path.join(root, 'tmp-preview-survey-ui.html');
const shotDir = path.join(root, 'tmp-screenshots');

function extractStyle() {
  const raw = fs.readFileSync(stylePath, 'utf8');
  const m = raw.match(/<style>([\s\S]*)<\/style>/);
  if (!m) throw new Error('styles.css.html に <style> が見つかりません');
  return m[1];
}

function buildPreviewHtml(style) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>survey UI preview</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<style>${style}</style>
</head>
<body>
<div class="container">
<h1 id="main-title">UI プレビュー（index.html 生成 DOM に近い形）</h1>
<div id="section-1" class="form-section active">
<div class="form-group" id="group-201">
<label class="field-heading" for="field-201-hidden">ボタン選択<span class="required-asterisk">*</span></label>
<div class="button-option" id="bo-201">
<button type="button" class="option-button" data-item-id="201" data-value="はい">はい</button>
<button type="button" class="option-button" data-item-id="201" data-value="いいえ">いいえ</button>
<button type="button" class="option-button" data-item-id="201" data-value="どちらでもない">どちらでもない</button>
</div>
<input type="hidden" id="field-201-hidden" name="201" value="">
<div class="error-message" id="field-201-hidden-error" style="display:none;">選択してください。</div>
</div>
<div class="form-group" id="group-202">
<label class="field-heading" for="input_202">テキスト<span class="required-asterisk">*</span></label>
<input type="text" id="input_202" name="input_202" value="">
<div class="error-message" id="field-202-error" style="display:none;">入力してください。</div>
</div>
<div class="button-group">
<button type="button" id="submit-button" class="page-next">送信する</button>
</div>
</div>
</div>
<script>
(function () {
  document.getElementById('bo-201').addEventListener('click', function (e) {
    var btn = e.target.closest('button.option-button');
    if (!btn) return;
    var wrap = btn.closest('.button-option');
    wrap.querySelectorAll('.option-button').forEach(function (b) { b.classList.remove('selected'); });
    btn.classList.add('selected');
    document.getElementById('field-201-hidden').value = btn.getAttribute('data-value') || '';
    var err = document.getElementById('field-201-hidden-error');
    err.style.display = 'none';
    wrap.classList.remove('error-state');
  });
})();
</script>
</body>
</html>`;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  fs.mkdirSync(shotDir, { recursive: true });
  fs.writeFileSync(previewPath, buildPreviewHtml(extractStyle()), 'utf8');

  const fileUrl = pathToFileURL(previewPath).href;
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });
  await new Promise(function (r) {
    setTimeout(r, 500);
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: path.join(shotDir, 'survey-ui-desktop.png'), fullPage: true });

  const dirDesktop = await page.$eval('#bo-201', function (el) {
    return getComputedStyle(el).flexDirection;
  });
  assert(dirDesktop === 'row', 'デスクトップ幅で .button-option は row であること: ' + dirDesktop);

  await page.click('.option-button[data-value="いいえ"]');
  const hiddenVal = await page.$eval('#field-201-hidden', function (el) {
    return el.value;
  });
  assert(hiddenVal === 'いいえ', 'hidden 値が選択と一致すること: ' + hiddenVal);

  const selectedCount = await page.$$eval('.option-button.selected', function (els) {
    return els.length;
  });
  assert(selectedCount === 1, 'selected クラスは 1 つのみ: ' + selectedCount);

  const selectedText = await page.$eval('.option-button.selected', function (el) {
    return el.textContent.trim();
  });
  assert(selectedText === 'いいえ', 'selected ボタンのラベル: ' + selectedText);

  await page.evaluate(function () {
    var err = document.getElementById('field-201-hidden-error');
    err.style.display = 'block';
    document.getElementById('bo-201').classList.add('error-state');
  });

  const pos = await page.evaluate(function () {
    var h = document.getElementById('field-201-hidden');
    var e = document.getElementById('field-201-hidden-error');
    var hr = h.getBoundingClientRect();
    var er = e.getBoundingClientRect();
    return {
      hiddenBottom: hr.bottom,
      errorTop: er.top,
      errorDisplay: getComputedStyle(e).display
    };
  });
  assert(pos.errorDisplay === 'block', 'error-message が表示されること');
  assert(pos.errorTop >= pos.hiddenBottom - 1, 'error-message が hidden より下に配置されること: hidden.bottom=' +
    pos.hiddenBottom + ' error.top=' + pos.errorTop);

  await page.setViewportSize({ width: 375, height: 900 });
  await new Promise(function (r) {
    setTimeout(r, 200);
  });
  await page.screenshot({ path: path.join(shotDir, 'survey-ui-375.png'), fullPage: true });

  const dirMobile = await page.$eval('#bo-201', function (el) {
    return getComputedStyle(el).flexDirection;
  });
  assert(dirMobile === 'column', '375px 幅で .button-option は column であること: ' + dirMobile);

  await browser.close();

  console.log('playwright-check-survey-ui: OK');
  console.log('  preview:', previewPath);
  console.log('  screenshots:', shotDir);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
