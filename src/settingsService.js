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
function SettingsService_checkIdShape_(id, userLabel) {
  if (!id || String(id).length < 10) {
    return {
      ok: false,
      recovery: userLabel + 'が短すぎるか空です。ブラウザのアドレス欄から、長い文字列をコピーできているか確認してください。'
    };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return {
      ok: false,
      recovery: userLabel + 'に余分な記号やスペースが入っている可能性があります。前後を含めてもう一度コピーし直してください。'
    };
  }
  return { ok: true };
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
function SettingsService_buildWrapperUrl() {
  assertSetupApiAccess_();
  try {
    var service = ScriptApp.getService();
    if (!service) {
      return {
        error: '回答用のURLを自動では取得できませんでした。',
        recovery: 'いま開いている画面のURLをコピーし、「?」以降を削除したものを回答用として使ってください。'
      };
    }
    var raw = service.getUrl();
    if (!raw) {
      return {
        error: '回答用のURLを自動では取得できませんでした。',
        recovery: 'いま開いている画面のURLをコピーし、「?」以降を削除したものを回答用として使ってください。'
      };
    }
    var base = String(raw).split('?')[0].split('#')[0];
    return { url: base };
  } catch (err) {
    console.log('SettingsService_buildWrapperUrl: ' + err.message);
    return {
      error: '回答用のURLを自動では取得できませんでした。',
      recovery: 'いま開いている画面のURLをコピーし、「?」以降を削除したものを回答用として使ってください。'
    };
  }
}

/**
 * 初期設定を保存する
 *
 * @param {{ formId?: string, oplogSheetId?: string }} data
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
  var formId = SettingsService_extractResourceId_(data.formId, 'form');
  var sheetId = SettingsService_extractResourceId_(data.oplogSheetId, 'sheet');

  if (!formId) {
    return {
      success: false,
      message: 'Googleフォームの情報が入力されていません。',
      recovery: 'フォームをブラウザで開き、アドレス欄に含まれる長い文字列をそのまま貼り付けても構いません。'
    };
  }
  if (!sheetId) {
    return {
      success: false,
      message: 'ログ保存先の情報が入力されていません。',
      recovery: 'スプレッドシートをブラウザで開き、アドレス欄の「/d/」と「/edit」のあいだの文字列をコピーして貼り付けてください。'
    };
  }

  var formShape = SettingsService_checkIdShape_(formId, 'フォームの文字列');
  if (!formShape.ok) {
    return {
      success: false,
      message: '設定を保存できませんでした。入力内容を確認してください。',
      recovery: formShape.recovery
    };
  }
  var sheetShape = SettingsService_checkIdShape_(sheetId, 'スプレッドシートの文字列');
  if (!sheetShape.ok) {
    return {
      success: false,
      message: '設定を保存できませんでした。入力内容を確認してください。',
      recovery: sheetShape.recovery
    };
  }

  try {
    FormApp.openById(formId);
  } catch (eForm) {
    console.log('SettingsService_saveSettings FormApp: ' + eForm.message);
    return {
      success: false,
      message: 'Googleフォームを開けませんでした。',
      recovery: 'コピー漏れがないか確認してください。このアプリと同じGoogleアカウントで、フォームを開けるかも確認してください。'
    };
  }

  try {
    SpreadsheetApp.openById(sheetId);
  } catch (eSheet) {
    console.log('SettingsService_saveSettings SpreadsheetApp: ' + eSheet.message);
    return {
      success: false,
      message: 'スプレッドシートを開けませんでした。',
      recovery: 'コピー漏れがないか確認してください。このアプリと同じGoogleアカウントで、そのシートを開けるかも確認してください。'
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
          message: '設定を保存できませんでした。',
          recovery: '組織アカウントでログインしてから、もう一度このページを開き直してください。'
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
      message: '設定を保存できませんでした。',
      recovery: 'しばらく時間をおいてから、もう一度お試しください。繰り返す場合は、このアプリを用意した担当者に連絡してください。'
    };
  }

  var urlResult = SettingsService_buildWrapperUrl();
  var wrapperUrl = urlResult.url || '';
  var urlRecovery = urlResult.recovery || '';

  return {
    success: true,
    message: '設定を保存しました。下のURLを回答者に共有してください。',
    wrapperUrl: wrapperUrl,
    nextSteps: '次にやること：下の「回答用のURL」をコピーして、メールやチャットで回答者に送ってください。この設定画面は、あとからいつでも開き直して変更できます。',
    urlRecovery: urlRecovery
  };
}
