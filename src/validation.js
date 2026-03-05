/**
 * validation.js — サーバ側バリデーション
 *
 * 仕様書参照: §3.3（サーバ側バリデーション）
 * Phase 1: GAS側で確実に実装できる範囲に限定。
 * Phase 2: FormItem.getValidation() を活用した高精度検証に拡張。
 */

/** テキスト型の文字数上限（Phase 1: 全テキスト型共通） */
var VALIDATION_TEXT_MAX_LENGTH = 10000;

/**
 * 回答データのサーバ側バリデーションを実行する。
 * §3.3: バリデーション失敗時はOp Logに記録せず即座にエラーを返す。
 *
 * @param {object} payload - クライアントから受信したJSON
 * @param {object} formDef - FormService_getFormDefinition() の結果
 * @returns {{ valid: boolean, error: string|null }}
 */
function Validation_validate(payload, formDef) {
  // §3.3-1: formRevisionHash の一致確認
  if (payload.formRevisionHash !== formDef.formRevisionHash) {
    return { valid: false, error: 'REVISION_MISMATCH' };
  }

  // §3.3-2: webAppVersion の許容範囲確認
  var currentVersion = Config_get(CONFIG_KEYS.WEBAPP_VERSION, CONFIG_DEFAULTS.WEBAPP_VERSION);
  if (payload.webAppVersion !== currentVersion) {
    return { valid: false, error: 'WEBAPP_VERSION_MISMATCH' };
  }

  // §3.3-3: submissionId の形式チェック（UUID v4）
  if (!Validation_isValidUUID_(payload.submissionId)) {
    return { valid: false, error: 'INVALID_SUBMISSION_ID' };
  }

  // §3.3-4,5,6: 各設問の回答を検証
  var answers = payload.answers || {};
  for (var i = 0; i < formDef.items.length; i++) {
    var item = formDef.items[i];
    var answer = answers[item.id];
    var itemError = Validation_validateItem_(item, answer);
    if (itemError !== null) {
      return { valid: false, error: itemError };
    }
  }

  return { valid: true, error: null };
}

/**
 * 個別の設問に対する回答を検証する。
 *
 * @param {object} item - フォーム定義上の設問
 * @param {*} answer - 回答値
 * @returns {string|null} エラー文字列。問題なければ null
 * @private
 */
function Validation_validateItem_(item, answer) {
  var isEmpty = (answer === undefined || answer === null || answer === '');
  var isArrayEmpty = Array.isArray(answer) && answer.length === 0;

  // §3.3-4: 必須項目の未入力チェック
  if (item.required && (isEmpty || isArrayEmpty)) {
    return 'REQUIRED_MISSING:' + item.id;
  }

  // 任意項目で未入力なら以降のチェック不要
  if (isEmpty || isArrayEmpty) {
    return null;
  }

  switch (item.type) {
    case 'TEXT':
    case 'PARAGRAPH_TEXT':
      // §3.3-6: テキスト型の文字数上限
      if (typeof answer !== 'string') {
        return 'INVALID_TYPE:' + item.id;
      }
      if (answer.length > VALIDATION_TEXT_MAX_LENGTH) {
        return 'TEXT_TOO_LONG:' + item.id;
      }
      break;

    case 'MULTIPLE_CHOICE':
    case 'LIST':
      // §3.3-5: 選択肢の整合性（単一選択）
      if (typeof answer !== 'string') {
        return 'INVALID_TYPE:' + item.id;
      }
      if (item.choices.indexOf(answer.trim()) === -1) {
        return 'INVALID_CHOICE:' + item.id;
      }
      break;

    case 'CHECKBOX':
      // §3.3-5: 選択肢の整合性（複数選択）
      if (!Array.isArray(answer)) {
        return 'INVALID_TYPE:' + item.id;
      }
      for (var j = 0; j < answer.length; j++) {
        if (item.choices.indexOf(answer[j].trim()) === -1) {
          return 'INVALID_CHOICE:' + item.id;
        }
      }
      break;
  }

  return null;
}

/**
 * UUID v4 形式の検証。
 *
 * @param {string} str
 * @returns {boolean}
 * @private
 */
function Validation_isValidUUID_(str) {
  if (typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}
