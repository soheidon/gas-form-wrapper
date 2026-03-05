/**
 * retry.js — 再送トリガー・STALE_RECEIVED検知
 *
 * 仕様書参照: §6.2（再送メカニズム）、§6.3（再送時のフォーム変更問題）
 *
 * 時間主導トリガー（5分間隔）から呼び出される。
 * トリガーの設定:
 *   ScriptApp.newTrigger('Retry_processAll')
 *     .timeBased()
 *     .everyMinutes(5)
 *     .create();
 */

/**
 * 再送対象のすべてのレコードを処理する。
 * 時間主導トリガーから呼び出されるエントリポイント。
 */
function Retry_processAll() {
  var targets = OpLog_getRetryTargets();

  if (targets.length === 0) {
    return;
  }

  console.log('再送対象: ' + targets.length + '件');

  // §6.3: 現在のフォーム定義とrevision hashを取得
  var currentFormDef = FormService_getFormDefinition();
  var retryMax = Config_getNumber(CONFIG_KEYS.RETRY_MAX, CONFIG_DEFAULTS.RETRY_MAX);

  for (var i = 0; i < targets.length; i++) {
    var target = targets[i];

    try {
      Retry_processOne_(target, currentFormDef, retryMax);
    } catch (e) {
      console.log('再送処理中にエラー (submissionId: ' + target.submissionId + '): ' + e.message);
    }
  }
}

/**
 * 1件の再送を処理する。
 *
 * @param {object} target - OpLog_getRetryTargets() の1要素
 * @param {object} currentFormDef - 現在のフォーム定義
 * @param {number} retryMax - 再試行上限
 * @private
 */
function Retry_processOne_(target, currentFormDef, retryMax) {
  // RECEIVED → STALE_RECEIVED への遷移
  if (target.needsStaleTransition) {
    OpLog_updateStatus(target.rowNumber, OPLOG_STATUS.STALE_RECEIVED);
    console.log('STALE_RECEIVED に遷移: ' + target.submissionId);
  }

  // §6.3: revision hash照合（再送時のフォーム変更チェック）
  if (target.formRevisionHash !== currentFormDef.formRevisionHash) {
    OpLog_updateStatus(target.rowNumber, OPLOG_STATUS.FAILED_PERMANENT, {
      errorType: 'REVISION_MISMATCH_ON_RETRY',
      errorMessage: '再送時にフォーム構造が変更されていたため、再送不能'
    });
    console.log('FAILED_PERMANENT (revision mismatch): ' + target.submissionId);
    Retry_notifyAdmin_('再送不能: フォーム構造変更', target.submissionId);
    return;
  }

  // responseData の復元
  var responseDataJson = target.responseData;
  if (typeof responseDataJson === 'string' && responseDataJson.indexOf('drive:') === 0) {
    // §9.1: DriveからJSON復元
    var fileId = responseDataJson.replace('drive:', '');
    var file = DriveApp.getFileById(fileId);
    responseDataJson = file.getBlob().getDataAsString();
  }

  var answers;
  try {
    answers = JSON.parse(responseDataJson);
  } catch (e) {
    OpLog_updateStatus(target.rowNumber, OPLOG_STATUS.FAILED_PERMANENT, {
      errorType: 'CORRUPTED_DATA',
      errorMessage: '回答データのパースに失敗: ' + e.message
    });
    return;
  }

  // リトライ回数インクリメント
  OpLog_incrementRetry(target.rowNumber, target.retryCount);

  // Submit実行
  var result = SubmitService_submit(currentFormDef, answers);

  if (result.success) {
    OpLog_updateStatus(target.rowNumber, OPLOG_STATUS.SUBMITTED, {
      submittedAt: new Date().toISOString()
    });
    console.log('再送成功: ' + target.submissionId);
  } else {
    var newRetryCount = target.retryCount + 1;
    var classified = SubmitService_classifyError_({ message: result.errorMessage });
    var newStatus;

    if (classified.isPermanent) {
      newStatus = OPLOG_STATUS.FAILED_PERMANENT;
    } else if (newRetryCount >= retryMax) {
      newStatus = OPLOG_STATUS.ABANDONED;
      Retry_notifyAdmin_('再送上限到達', target.submissionId);
    } else {
      newStatus = OPLOG_STATUS.FAILED_TRANSIENT;
    }

    OpLog_updateStatus(target.rowNumber, newStatus, {
      errorType: result.errorType,
      errorMessage: result.errorMessage
    });
    console.log('再送失敗 (' + newStatus + '): ' + target.submissionId);
  }
}

/**
 * 管理者にメール通知を送る。
 * §6.2: 連続失敗時の通知。
 *
 * @param {string} subject - 件名の補足
 * @param {string} submissionId - 対象のsubmissionId
 * @private
 */
function Retry_notifyAdmin_(subject, submissionId) {
  try {
    var emails = Config_get(CONFIG_KEYS.ADMIN_EMAILS, '');
    if (!emails) return;

    var recipients = emails.split(',').map(function(e) { return e.trim(); });
    var body = '院内アンケートシステム: ' + subject + '\n'
      + 'submissionId: ' + submissionId + '\n'
      + '時刻: ' + new Date().toISOString() + '\n'
      + '\nOp Log を確認してください。';

    for (var i = 0; i < recipients.length; i++) {
      MailApp.sendEmail(recipients[i], '【院内アンケート】' + subject, body);
    }
  } catch (e) {
    console.log('管理者通知の送信に失敗: ' + e.message);
  }
}

/**
 * 再送トリガーを初期設定する。
 * 初回セットアップ時に1回だけ手動実行する。
 */
function Retry_setupTrigger() {
  // 既存トリガーの削除
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'Retry_processAll') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // 5分間隔トリガーの作成
  ScriptApp.newTrigger('Retry_processAll')
    .timeBased()
    .everyMinutes(5)
    .create();

  console.log('再送トリガーを設定しました（5分間隔）');
}
