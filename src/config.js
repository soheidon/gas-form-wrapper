/**
 * config.js — スクリプトプロパティの読み出し
 *
 * すべてのGoogleリソースID・設定値はスクリプトプロパティから取得する。
 * コードへのハードコード禁止。
 */

/**
 * スクリプトプロパティを取得する。
 * 未設定の場合は defaultValue を返す。
 *
 * @param {string} key - プロパティキー
 * @param {string} [defaultValue] - デフォルト値
 * @returns {string}
 */
function Config_get(key, defaultValue) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  if (value === null && defaultValue !== undefined) {
    return defaultValue;
  }
  if (value === null) {
    throw new Error('スクリプトプロパティ "' + key + '" が未設定です');
  }
  return value;
}

/**
 * 数値のスクリプトプロパティを取得する。
 *
 * @param {string} key
 * @param {number} [defaultValue]
 * @returns {number}
 */
function Config_getNumber(key, defaultValue) {
  var raw = Config_get(key, defaultValue !== undefined ? String(defaultValue) : undefined);
  var num = Number(raw);
  if (isNaN(num)) {
    throw new Error('スクリプトプロパティ "' + key + '" が数値ではありません: ' + raw);
  }
  return num;
}

// --- プロパティキー定数 ---

var CONFIG_KEYS = {
  FORM_ID: 'FORM_ID',
  OPLOG_SHEET_ID: 'OPLOG_SHEET_ID',
  OPLOG_DRIVE_FOLDER_ID: 'OPLOG_DRIVE_FOLDER_ID',
  ADMIN_EMAILS: 'ADMIN_EMAILS',
  RETRY_MAX: 'RETRY_MAX',
  STALE_THRESHOLD_MIN: 'STALE_THRESHOLD_MIN',
  WEBAPP_VERSION: 'WEBAPP_VERSION'
};

// --- デフォルト値 ---

var CONFIG_DEFAULTS = {
  RETRY_MAX: 3,
  STALE_THRESHOLD_MIN: 15,
  WEBAPP_VERSION: '1'
};
