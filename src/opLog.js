/**
 * opLog.js — Op Log 読み書き・LockService制御
 *
 * 仕様書参照: §9.1（列設計）、§9.2（同時書き込み制御）
 *
 * 【重要】§9.2 LockServiceスコープ:
 * スプレッドシート書き込みの瞬間だけロックを取得・解放する。
 * FormApp.submit() 実行中は絶対にロックを保持しない。
 */

/** Op Log の列インデックス（0始まり、§9.1準拠） */
var OPLOG_COLUMNS = {
  SUBMISSION_ID: 0,
  STATUS: 1,
  RECEIVED_AT: 2,
  SUBMITTED_AT: 3,
  FORM_REVISION_HASH: 4,
  USER_EMAIL: 5,
  USER_TEMP_KEY: 6,
  RESPONSE_DATA: 7,
  ERROR_TYPE: 8,
  ERROR_MESSAGE: 9,
  RETRY_COUNT: 10,
  LAST_RETRY_AT: 11
};

/** ステータス定数（§6.4） */
var OPLOG_STATUS = {
  RECEIVED: 'RECEIVED',
  STALE_RECEIVED: 'STALE_RECEIVED',
  SUBMITTED: 'SUBMITTED',
  FAILED_TRANSIENT: 'FAILED_TRANSIENT',
  FAILED_PERMANENT: 'FAILED_PERMANENT',
  ABANDONED: 'ABANDONED'
};

/** responseData の文字数閾値（§9.1: 40,000文字超はDriveへ退避） */
var OPLOG_RESPONSE_DATA_THRESHOLD = 40000;

/**
 * Op Log スプレッドシートのシートオブジェクトを取得する。
 *
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 * @private
 */
function OpLog_getSheet_() {
  var sheetId = Config_get(CONFIG_KEYS.OPLOG_SHEET_ID);
  var ss = SpreadsheetApp.openById(sheetId);
  return ss.getSheets()[0]; // 最初のシートを使用
}

/**
 * ロックを取得して関数を実行し、完了後にロックを解放する。
 * §9.2: ロック取得タイムアウト10秒、最大2回リトライ。
 *
 * @param {Function} fn - ロック内で実行する関数
 * @returns {*} fn の戻り値
 */
function OpLog_withLock_(fn) {
  var lock = LockService.getScriptLock();
  var maxRetries = 2;

  for (var attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      lock.waitLock(10000); // 10秒
      try {
        var result = fn();
        return result;
      } finally {
        lock.releaseLock();
      }
    } catch (e) {
      if (attempt < maxRetries) {
        Utilities.sleep(1000); // 1秒待ってリトライ
        continue;
      }
      throw new Error('LOCK_TIMEOUT: Op Logへの書き込みロック取得に失敗しました（' + (maxRetries + 1) + '回試行）');
    }
  }
}

/**
 * responseData を保存用に変換する。
 * §9.1: 40,000文字超はGoogle DriveにJSONファイルとして保存し、Op LogにはファイルIDのみ記録。
 *
 * @param {string} jsonStr - 回答JSON文字列
 * @param {string} submissionId - 紐付け用ID
 * @returns {string} セルに書き込む値（JSON文字列 or "drive:<fileId>"）
 * @private
 */
function OpLog_prepareResponseData_(jsonStr, submissionId) {
  if (jsonStr.length <= OPLOG_RESPONSE_DATA_THRESHOLD) {
    return jsonStr;
  }

  // DriveにJSONファイルとして保存（専用フォルダ配下）
  var fileName = 'oplog_response_' + submissionId + '.json';
  var folderId = Config_get(CONFIG_KEYS.OPLOG_DRIVE_FOLDER_ID, '');
  var file;

  if (folderId) {
    var folder = DriveApp.getFolderById(folderId);
    file = folder.createFile(fileName, jsonStr, 'application/json');
  } else {
    // フォルダ未設定時はマイドライブ直下（非推奨、ログで警告）
    console.log('警告: OPLOG_DRIVE_FOLDER_ID が未設定。マイドライブ直下にファイルを作成します。');
    file = DriveApp.createFile(fileName, jsonStr, 'application/json');
  }

  console.log('responseData をDriveに退避: ' + file.getId() + ' (' + jsonStr.length + '文字)');
  return 'drive:' + file.getId();
}

/**
 * RECEIVED 状態で Op Log に新規行を追記する。
 * §6.1 WALパターン: Submit実行前に必ず呼ぶ。
 * §9.2: この関数内でのみロックを取得・解放する。
 *
 * @param {object} params
 * @param {string} params.submissionId
 * @param {string} params.formRevisionHash
 * @param {string} params.userEmail
 * @param {string} params.userTempKey
 * @param {string} params.responseDataJson - 回答JSON文字列
 * @returns {number} 書き込んだ行番号
 */
function OpLog_writeReceived(params) {
  var responseDataCell = OpLog_prepareResponseData_(params.responseDataJson, params.submissionId);

  return OpLog_withLock_(function() {
    var sheet = OpLog_getSheet_();
    var row = [
      params.submissionId,          // submissionId
      OPLOG_STATUS.RECEIVED,        // status
      new Date().toISOString(),     // receivedAt
      '',                           // submittedAt
      params.formRevisionHash,      // formRevisionHash
      params.userEmail || '',       // userEmail
      params.userTempKey || '',     // userTempKey
      responseDataCell,             // responseData
      '',                           // errorType
      '',                           // errorMessage
      0,                            // retryCount
      ''                            // lastRetryAt
    ];
    sheet.appendRow(row);
    return sheet.getLastRow();
  });
}

/**
 * Op Log の指定行のステータスを更新する。
 * §9.2: この関数内でのみロックを取得・解放する。
 *
 * @param {number} rowNumber - 対象行番号
 * @param {string} newStatus - 新しいステータス
 * @param {object} [extra] - 追加で更新するフィールド
 * @param {string} [extra.errorType]
 * @param {string} [extra.errorMessage]
 * @param {string} [extra.submittedAt]
 */
function OpLog_updateStatus(rowNumber, newStatus, extra) {
  OpLog_withLock_(function() {
    var sheet = OpLog_getSheet_();
    sheet.getRange(rowNumber, OPLOG_COLUMNS.STATUS + 1).setValue(newStatus);

    if (extra) {
      if (extra.submittedAt) {
        sheet.getRange(rowNumber, OPLOG_COLUMNS.SUBMITTED_AT + 1).setValue(extra.submittedAt);
      }
      if (extra.errorType) {
        sheet.getRange(rowNumber, OPLOG_COLUMNS.ERROR_TYPE + 1).setValue(extra.errorType);
      }
      if (extra.errorMessage) {
        sheet.getRange(rowNumber, OPLOG_COLUMNS.ERROR_MESSAGE + 1).setValue(extra.errorMessage);
      }
    }
  });
}

/**
 * submissionId が既に Op Log に存在するか確認する。
 * §6.5 冪等性: 重複Submit防止。
 * TextFinder を使用し、全行走査（O(n)）を回避する。
 *
 * @param {string} submissionId
 * @returns {{ exists: boolean, status: string|null, rowNumber: number|null }}
 */
function OpLog_findBySubmissionId(submissionId) {
  var sheet = OpLog_getSheet_();
  // 列A（submissionId列）のみを検索対象にする
  var range = sheet.getRange('A:A');
  var finder = range.createTextFinder(submissionId).matchEntireCell(true);
  var found = finder.findNext();

  if (found === null) {
    return { exists: false, status: null, rowNumber: null };
  }

  var rowNumber = found.getRow();
  var status = sheet.getRange(rowNumber, OPLOG_COLUMNS.STATUS + 1).getValue();

  return {
    exists: true,
    status: status,
    rowNumber: rowNumber
  };
}

/**
 * 再送対象のレコードを取得する。
 * §6.2: FAILED_TRANSIENT + STALE_RECEIVED（15分以上経過した RECEIVED）
 *
 * @returns {object[]} 再送対象レコードの配列
 */
function OpLog_getRetryTargets() {
  var sheet = OpLog_getSheet_();
  var data = sheet.getDataRange().getValues();
  var now = new Date();
  var staleThreshold = Config_getNumber(
    CONFIG_KEYS.STALE_THRESHOLD_MIN,
    CONFIG_DEFAULTS.STALE_THRESHOLD_MIN
  );
  var retryMax = Config_getNumber(CONFIG_KEYS.RETRY_MAX, CONFIG_DEFAULTS.RETRY_MAX);
  var targets = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var status = row[OPLOG_COLUMNS.STATUS];
    var retryCount = Number(row[OPLOG_COLUMNS.RETRY_COUNT]) || 0;

    // 再試行上限チェック
    if (retryCount >= retryMax) {
      continue;
    }

    if (status === OPLOG_STATUS.FAILED_TRANSIENT || status === OPLOG_STATUS.STALE_RECEIVED) {
      targets.push({
        rowNumber: i + 1,
        submissionId: row[OPLOG_COLUMNS.SUBMISSION_ID],
        formRevisionHash: row[OPLOG_COLUMNS.FORM_REVISION_HASH],
        responseData: row[OPLOG_COLUMNS.RESPONSE_DATA],
        retryCount: retryCount,
        status: status
      });
    } else if (status === OPLOG_STATUS.RECEIVED) {
      // §6.2: RECEIVED が一定時間放置 → STALE_RECEIVED
      var receivedAt = new Date(row[OPLOG_COLUMNS.RECEIVED_AT]);
      var elapsedMin = (now - receivedAt) / (1000 * 60);
      if (elapsedMin >= staleThreshold) {
        targets.push({
          rowNumber: i + 1,
          submissionId: row[OPLOG_COLUMNS.SUBMISSION_ID],
          formRevisionHash: row[OPLOG_COLUMNS.FORM_REVISION_HASH],
          responseData: row[OPLOG_COLUMNS.RESPONSE_DATA],
          retryCount: retryCount,
          status: status,
          needsStaleTransition: true
        });
      }
    }
  }

  return targets;
}

/**
 * リトライ回数をインクリメントする。
 *
 * @param {number} rowNumber
 * @param {number} currentCount
 */
function OpLog_incrementRetry(rowNumber, currentCount) {
  OpLog_withLock_(function() {
    var sheet = OpLog_getSheet_();
    sheet.getRange(rowNumber, OPLOG_COLUMNS.RETRY_COUNT + 1).setValue(currentCount + 1);
    sheet.getRange(rowNumber, OPLOG_COLUMNS.LAST_RETRY_AT + 1).setValue(new Date().toISOString());
  });
}

/**
 * 指定行のデータを取得する（手動再送用）。
 *
 * @param {number} rowNumber
 * @returns {object|null}
 */
function OpLog_getRowData(rowNumber) {
  var sheet = OpLog_getSheet_();
  var row = sheet.getRange(rowNumber, 1, 1, 12).getValues()[0];

  if (!row[OPLOG_COLUMNS.SUBMISSION_ID]) {
    return null;
  }

  return {
    rowNumber: rowNumber,
    submissionId: row[OPLOG_COLUMNS.SUBMISSION_ID],
    status: row[OPLOG_COLUMNS.STATUS],
    formRevisionHash: row[OPLOG_COLUMNS.FORM_REVISION_HASH],
    responseData: row[OPLOG_COLUMNS.RESPONSE_DATA],
    retryCount: Number(row[OPLOG_COLUMNS.RETRY_COUNT]) || 0
  };
}
