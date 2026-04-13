/**
 * settingsService.js — 初期設定の保存・読込・ラッパーURL生成（Phase 2）
 * DESIGN.md 7章（setup 画面）向け。保存先は Script Properties（FORM_ID / OPLOG_SHEET_ID）。
 */

/**
 * 入力からリソースIDを取り出す（URL貼り付けにも対応）
 *
 * @param {string} raw
 * @param {'form'|'sheet'} kind
 * @returns {string}
 * @private
 */
function SettingsService_extractResourceId_(raw, kind) {
  var s = String(raw == null ? '' : raw).trim();
  if (!s) return '';

  if (kind === 'form') {
    var mE = s.match(/\/forms\/d\/e\/([a-zA-Z0-9_-]+)/);
    if (mE && mE[1]) return mE[1];
    var m = s.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
    if (m && m[1]) return m[1];
  }

  if (kind === 'sheet') {
    var m2 = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (m2 && m2[1]) return m2[1];
  }

  return s.replace(/\s/g, '');
}

/**
 * @param {string} id
 * @param {string} userLabel - 画面上の呼び方（技術用語を避ける）
 * @returns {{ ok: boolean, recovery?: string }}
 * @private
 */
/**
 * @param {string} id
 * @param {'ja'|'en'} lang
 * @param {'form'|'sheet'} kind
 * @returns {{ ok: boolean, recovery?: string }}
 * @private
 */
function SettingsService_checkIdShape_(id, lang, kind) {
  var labelJa = kind === 'form' ? 'フォームの文字列' : 'スプレッドシートの文字列';
  if (!id || String(id).length < 10) {
    return {
      ok: false,
      recovery: lang === 'en'
        ? 'This value looks too short or empty. Copy the full URL from the browser address bar.'
        : labelJa + 'が短すぎるか空です。ブラウザのアドレス欄から、長い文字列をコピーできているか確認してください。'
    };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return {
      ok: false,
      recovery: lang === 'en'
        ? 'The value may contain extra symbols or spaces. Copy the URL again from beginning to end.'
        : labelJa + 'に余分な記号やスペースが入っている可能性があります。前後を含めてもう一度コピーし直してください。'
    };
  }
  return { ok: true };
}

/**
 * @param {*} v
 * @returns {'ja'|'en'}
 * @private
 */
function SettingsService_normalizeUiLang_(v) {
  return String(v || '').toLowerCase() === 'en' ? 'en' : 'ja';
}

/**
 * 保存済みのフォームID・ログ用スプレッドシートIDを返す（未設定は空文字）
 *
 * @returns {{ formId: string, oplogSheetId: string }}
 */
function SettingsService_getSettings() {
  assertSetupApiAccess_();
  var props = PropertiesService.getScriptProperties();
  return {
    formId: props.getProperty(CONFIG_KEYS.FORM_ID) || '',
    oplogSheetId: props.getProperty(CONFIG_KEYS.OPLOG_SHEET_ID) || ''
  };
}

/**
 * 回答者向けの公開URL（クエリなしのベース）
 *
 * @returns {{ url: string }|{ error: string, recovery: string }}
 */
/**
 * @param {'ja'|'en'} [optLang]
 * @returns {{ url: string }|{ error: string, recovery: string }}
 */
function SettingsService_buildWrapperUrl(optLang) {
  assertSetupApiAccess_();
  var lang = SettingsService_normalizeUiLang_(optLang);
  var errE = lang === 'en'
    ? 'Could not get the respondent URL automatically.'
    : '回答用のURLを自動では取得できませんでした。';
  var recE = lang === 'en'
    ? 'Copy the URL from your browser address bar and remove everything from ? onward to use it as the respondent link.'
    : 'いま開いている画面のURLをコピーし、「?」以降を削除したものを回答用として使ってください。';
  try {
    var service = ScriptApp.getService();
    if (!service) {
      return { error: errE, recovery: recE };
    }
    var raw = service.getUrl();
    if (!raw) {
      return { error: errE, recovery: recE };
    }
    var base = String(raw).split('?')[0].split('#')[0];
    return { url: base };
  } catch (err) {
    console.log('SettingsService_buildWrapperUrl: ' + err.message);
    return { error: errE, recovery: recE };
  }
}

/**
 * 初期設定を保存する
 *
 * @param {{ formId?: string, oplogSheetId?: string, uiLang?: string }} data — uiLang が 'en' のときメッセージを英語化
 * @returns {{
 *   success: boolean,
 *   message: string,
 *   wrapperUrl?: string,
 *   nextSteps?: string,
 *   recovery?: string,
 *   urlRecovery?: string
 * }}
 */
function SettingsService_saveSettings(data) {
  assertSetupApiAccess_();
  data = data || {};
  var lang = SettingsService_normalizeUiLang_(data.uiLang);
  var formId = SettingsService_extractResourceId_(data.formId, 'form');
  var sheetId = SettingsService_extractResourceId_(data.oplogSheetId, 'sheet');

  if (!formId) {
    return {
      success: false,
      message: lang === 'en' ? 'No Google Form URL was entered.' : 'Googleフォームの情報が入力されていません。',
      recovery: lang === 'en'
        ? 'Open your form in the browser and paste the full URL from the address bar.'
        : 'フォームをブラウザで開き、アドレス欄に含まれる長い文字列をそのまま貼り付けても構いません。'
    };
  }
  if (!sheetId) {
    return {
      success: false,
      message: lang === 'en' ? 'No Google Sheet URL was entered.' : 'ログ保存先の情報が入力されていません。',
      recovery: lang === 'en'
        ? 'Open the sheet you use for logs in the browser and paste the full URL from the address bar.'
        : 'スプレッドシートをブラウザで開き、アドレス欄の「/d/」と「/edit」のあいだの文字列をコピーして貼り付けてください。'
    };
  }

  var formShape = SettingsService_checkIdShape_(formId, lang, 'form');
  if (!formShape.ok) {
    return {
      success: false,
      message: lang === 'en'
        ? 'Could not save settings. Please check what you entered.'
        : '設定を保存できませんでした。入力内容を確認してください。',
      recovery: formShape.recovery
    };
  }
  var sheetShape = SettingsService_checkIdShape_(sheetId, lang, 'sheet');
  if (!sheetShape.ok) {
    return {
      success: false,
      message: lang === 'en'
        ? 'Could not save settings. Please check what you entered.'
        : '設定を保存できませんでした。入力内容を確認してください。',
      recovery: sheetShape.recovery
    };
  }

  try {
    FormApp.openById(formId);
  } catch (eForm) {
    console.log('SettingsService_saveSettings FormApp: ' + eForm.message);
    return {
      success: false,
      message: lang === 'en' ? 'Could not open the Google Form.' : 'Googleフォームを開けませんでした。',
      recovery: lang === 'en'
        ? 'Check that you copied the full URL. Make sure you can open the form in the same Google account that runs this app.'
        : 'コピー漏れがないか確認してください。このアプリと同じGoogleアカウントで、フォームを開けるかも確認してください。'
    };
  }

  try {
    SpreadsheetApp.openById(sheetId);
  } catch (eSheet) {
    console.log('SettingsService_saveSettings SpreadsheetApp: ' + eSheet.message);
    return {
      success: false,
      message: lang === 'en' ? 'Could not open the Google Sheet.' : 'スプレッドシートを開けませんでした。',
      recovery: lang === 'en'
        ? 'Check that you copied the full URL. Make sure you can open the sheet in the same Google account that runs this app.'
        : 'コピー漏れがないか確認してください。このアプリと同じGoogleアカウントで、そのシートを開けるかも確認してください。'
    };
  }

  try {
    var props = PropertiesService.getScriptProperties();

    if (isBootstrapAdmin_()) {
      var ownerEmail = '';
      try {
        ownerEmail = Session.getActiveUser().getEmail();
      } catch (eOwner) {
        // ignore
      }
      if (!ownerEmail) {
        return {
          success: false,
          message: lang === 'en' ? 'Could not save settings.' : '設定を保存できませんでした。',
          recovery: lang === 'en'
            ? 'Sign in with your organization Google account, then open this page again.'
            : '組織アカウントでログインしてから、もう一度このページを開き直してください。'
        };
      }
      props.setProperty(CONFIG_KEYS.ADMIN_EMAILS, ownerEmail);
      props.setProperty(CONFIG_KEYS.FORM_ID, formId);
      props.setProperty(CONFIG_KEYS.OPLOG_SHEET_ID, sheetId);
    } else {
      assertAdmin_();
      props.setProperty(CONFIG_KEYS.FORM_ID, formId);
      props.setProperty(CONFIG_KEYS.OPLOG_SHEET_ID, sheetId);
    }
  } catch (eSave) {
    console.log('SettingsService_saveSettings props: ' + eSave.message);
    return {
      success: false,
      message: lang === 'en' ? 'Could not save settings.' : '設定を保存できませんでした。',
      recovery: lang === 'en'
        ? 'Wait a moment and try again. If it keeps happening, contact the person who set up this app.'
        : 'しばらく時間をおいてから、もう一度お試しください。繰り返す場合は、このアプリを用意した担当者に連絡してください。'
    };
  }

  var urlResult = SettingsService_buildWrapperUrl(lang);
  var wrapperUrl = urlResult.url || '';
  var urlRecovery = urlResult.recovery || '';

  return {
    success: true,
    message: lang === 'en'
      ? 'Settings saved. Share the URL below with respondents.'
      : '設定を保存しました。下のURLを回答者に共有してください。',
    wrapperUrl: wrapperUrl,
    nextSteps: lang === 'en'
      ? 'Next: copy the “URL for respondents” below and send it by email or chat. You can reopen this setup page later to change settings.'
      : '次にやること：下の「回答用のURL」をコピーして、メールやチャットで回答者に送ってください。この設定画面は、あとからいつでも開き直して変更できます。',
    urlRecovery: urlRecovery
  };
}
