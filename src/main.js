/**
 * main.js — doGet / doPost エントリポイント
 *
 * 仕様書参照: §3.1（GET）、§3.2（POST）、§7.1（権限）
 *
 * 【クライアント-サーバ通信の設計判断】
 * Phase 1 ではクライアント-サーバ通信に google.script.run を採用する。
 * 理由:
 *   - GASの認証が自動で効き、CSRF/認証の追加実装が不要
 *   - doPost + fetch だと CORS やリダイレクト周りで GAS 特有のハマりどころがある
 *   - google.script.run はコールバック形式で、エラーハンドリングが素直に書ける
 *
 * doPost は将来の外部連携・API経由アクセス用として残すが、
 * Phase 1 の回答画面・管理画面は google.script.run を正とする。
 */

// =========================================================================
// 管理者認可
// =========================================================================

/**
 * 管理者権限を検証する。管理者でなければ例外を投げる。
 * すべての管理者向けサーバ関数の冒頭で呼ぶこと。
 *
 * @throws {Error} 管理者でない場合
 * @private
 */
function assertAdmin_() {
  var email = '';
  try {
    email = Session.getActiveUser().getEmail();
  } catch (e) {
    // ignore
  }

  if (!email) {
    throw new Error('ADMIN_AUTH_FAILED: ユーザーを特定できません。組織アカウントでログインしてください。');
  }

  var adminEmails = Config_get(CONFIG_KEYS.ADMIN_EMAILS, '');
  var admins = adminEmails.split(',').map(function(e) { return e.trim().toLowerCase(); });

  if (admins.indexOf(email.toLowerCase()) === -1) {
    throw new Error('ADMIN_AUTH_FAILED: 管理者権限がありません (' + email + ')');
  }
}

/**
 * 管理者かどうかを判定する（例外を投げずにboolを返す版）。
 *
 * @returns {boolean}
 * @private
 */
function isAdmin_() {
  try {
    assertAdmin_();
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * ADMIN_EMAILS が未設定または空なら「初回（ブートストラップ）」とみなす。
 *
 * @returns {boolean}
 * @private
 */
function isBootstrapAdmin_() {
  var raw = PropertiesService.getScriptProperties().getProperty(CONFIG_KEYS.ADMIN_EMAILS);
  if (raw === null || raw === undefined) return true;
  return String(raw).trim() === '';
}

/**
 * setup 系 API 用: 初回は誰でも可、それ以外は管理者のみ。
 *
 * @throws {Error} 管理者でない場合（非初回）
 * @private
 */
function assertSetupApiAccess_() {
  if (isBootstrapAdmin_()) return;
  assertAdmin_();
}

// =========================================================================
// WebApp ハンドラ
// =========================================================================

/**
 * WebApp GET ハンドラ。
 * §3.1: 回答画面を配信する。初期設定は ?page=setup（初回は通常URLでも setup）、管理者画面は ?page=admin。
 *
 * 管理者画面はページ配信時点で権限チェックし、非管理者にはエラーを返す。
 * XFrameOptionsMode はデフォルト（SAMEORIGIN相当）を使用し、
 * iframe 埋め込みを許可しない（クリックジャッキング対策）。
 *
 * @param {object} e - イベントオブジェクト
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 */
function doGet(e) {
  // HtmlService では HTML 内の <meta name="viewport"> が無視されるため、必ず addMetaTag で注入する
  var viewportContent = 'width=device-width, initial-scale=1, viewport-fit=cover';

  var page = (e && e.parameter && e.parameter.page) || 'index';

  // 初回: ADMIN_EMAILS 未設定時は setup を誰でも表示（組織内アクセス前提）
  if (isBootstrapAdmin_()) {
    if (page === 'setup' || page === 'index') {
      return HtmlService.createTemplateFromFile('html/setup')
        .evaluate()
        .setTitle('初期設定')
        .addMetaTag('viewport', viewportContent);
    }
  }

  if (page === 'setup') {
    if (!isAdmin_()) {
      return HtmlService.createHtmlOutput(
        '<html><body><h2>アクセス権限がありません</h2>'
        + '<p>この画面は管理者のみ利用できます。</p></body></html>'
      )
        .setTitle('アクセス拒否')
        .addMetaTag('viewport', viewportContent);
    }

    return HtmlService.createTemplateFromFile('html/setup')
      .evaluate()
      .setTitle('初期設定')
      .addMetaTag('viewport', viewportContent);
  }

  if (page === 'admin') {
    // 管理者チェック（ページ配信時点で弾く）
    if (!isAdmin_()) {
      return HtmlService.createHtmlOutput(
        '<html><body><h2>アクセス権限がありません</h2>'
        + '<p>この画面は管理者のみ利用できます。</p></body></html>'
      )
        .setTitle('アクセス拒否')
        .addMetaTag('viewport', viewportContent);
    }

    return HtmlService.createTemplateFromFile('html/admin')
      .evaluate()
      .setTitle('院内アンケート — 管理画面')
      .addMetaTag('viewport', viewportContent);
  }

  var indexPageTitle = 'アンケート';
  try {
    var fid = Config_get(CONFIG_KEYS.FORM_ID);
    var f = FormApp.openById(fid);
    indexPageTitle = FormService_resolveFormTitle_(f, fid);
  } catch (e) {
    // FORM_ID 未設定・open 失敗時は上記フォールバックのまま
  }

  return HtmlService.createTemplateFromFile('html/index')
    .evaluate()
    .setTitle(indexPageTitle)
    .addMetaTag('viewport', viewportContent);
}

/**
 * WebApp POST ハンドラ。
 * Phase 1 では google.script.run を正とするため、doPost は外部連携用の予備。
 * 内部的には processSubmission_() を呼ぶ点は同じ。
 *
 * @param {object} e - イベントオブジェクト
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var result = processSubmission_(payload);
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.log('doPost エラー: ' + error.message);
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: 'SERVER_ERROR',
        message: error.message
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// =========================================================================
// 回答送信処理
// =========================================================================

/**
 * answers[itemId] が google.script.run / JSON 経由で string キーになる場合にも対応する。
 *
 * @param {object} answers
 * @param {number} itemId
 * @returns {*}
 * @private
 */
function Answers_lookup_(answers, itemId) {
  if (answers == null || typeof answers !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(answers, itemId)) return answers[itemId];
  var sk = String(itemId);
  if (Object.prototype.hasOwnProperty.call(answers, sk)) return answers[sk];
  return undefined;
}

/**
 * payload.answers を formDef の設問 ID のみに絞り、単一選択の不正値（選択肢に無い文字列）を除外する。
 *
 * @param {object} answers
 * @param {object} formDef
 * @returns {object}
 * @private
 */
/**
 * @param {number[]|null|undefined} visitedSections
 * @private
 */
function Submission_itemSectionVisited_(visitedSections, sectionNum) {
  if (!visitedSections || visitedSections.length === 0) return true;
  if (sectionNum === undefined || sectionNum === null) return true;
  for (var vi = 0; vi < visitedSections.length; vi++) {
    if (Number(visitedSections[vi]) === Number(sectionNum)) return true;
  }
  return false;
}

function sanitizeAnswersForForm_(answers, formDef, visitedSections) {
  var restrict = visitedSections && Array.isArray(visitedSections) && visitedSections.length > 0;
  var secMap = formDef.itemSectionByItemId || {};
  var out = {};
  for (var i = 0; i < formDef.items.length; i++) {
    var it = formDef.items[i];
    if (it.type === 'PAGE_BREAK' || it.type === 'SECTION_HEADER') continue;

    if (restrict) {
      var sn = secMap[String(it.id)];
      if (sn === undefined) sn = secMap[it.id];
      if (!Submission_itemSectionVisited_(visitedSections, sn)) continue;
    }

    var v = Answers_lookup_(answers, it.id);
    if (v === undefined || v === null) continue;

    if (it.type === 'MULTIPLE_CHOICE' || it.type === 'LIST') {
      if (typeof v !== 'string') continue;
      var trimmed = v.trim();
      if (!it.choices || it.choices.indexOf(trimmed) === -1) continue;
      out[it.id] = trimmed;
      continue;
    }

    out[it.id] = v;
  }
  return out;
}

/**
 * 回答送信の全フローを処理する。
 * §3.2 のステップ 2〜6 を実行。
 *
 * @param {object} payload - クライアントからのJSON
 * @returns {object} レスポンス
 * @private
 */
function processSubmission_(payload) {
  // --- Step 2: サーバ側バリデーション (§3.3) ---
  var formDef = FormService_getFormDefinition();
  var visited = payload.visitedSections;
  var answersSanitized = sanitizeAnswersForForm_(payload.answers || {}, formDef, visited);
  payload = {
    answers: answersSanitized,
    visitedSections: visited,
    formRevisionHash: payload.formRevisionHash,
    webAppVersion: payload.webAppVersion,
    submissionId: payload.submissionId
  };
  var validation = Validation_validate(payload, formDef);

  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
      message: getValidationErrorMessage_(validation.error)
    };
  }

  // --- §6.5: 冪等性チェック（重複送信防止） ---
  var existing = OpLog_findBySubmissionId(payload.submissionId);
  if (existing.exists) {
    if (existing.status === OPLOG_STATUS.SUBMITTED) {
      return { success: true, message: '既に送信済みです', submissionId: payload.submissionId };
    }
    return { success: true, message: '処理中です', submissionId: payload.submissionId };
  }

  // --- Step 3: Op Log に RECEIVED 記録 (§6.1 WAL) ---
  var userInfo = getUserInfo_();

  var rowNumber;
  try {
    rowNumber = OpLog_writeReceived({
      submissionId: payload.submissionId,
      formRevisionHash: payload.formRevisionHash,
      userEmail: userInfo.email,
      userTempKey: userInfo.tempKey,
      responseDataJson: JSON.stringify(payload.answers)
    });
  } catch (lockError) {
    return {
      success: false,
      error: 'LOCK_TIMEOUT',
      message: '混雑しています。しばらく待ってから再試行してください。'
    };
  }

  // --- Step 4: Submit 実行 (§9.2: ロックなしで実行) ---
  var submitResult = SubmitService_submit(formDef, payload.answers);

  // --- Step 5 or 6: 結果を Op Log に記録 ---
  if (submitResult.success) {
    OpLog_updateStatus(rowNumber, OPLOG_STATUS.SUBMITTED, {
      submittedAt: new Date().toISOString()
    });
    return {
      success: true,
      message: '回答を送信しました',
      submissionId: payload.submissionId
    };
  } else {
    var errorClassification = SubmitService_classifyError_({ message: submitResult.errorMessage });
    var failStatus = errorClassification.isPermanent
      ? OPLOG_STATUS.FAILED_PERMANENT
      : OPLOG_STATUS.FAILED_TRANSIENT;

    OpLog_updateStatus(rowNumber, failStatus, {
      errorType: submitResult.errorType,
      errorMessage: submitResult.errorMessage
    });

    return {
      success: false,
      received: true,
      error: submitResult.errorType,
      message: '回答は受け付けました。送信処理は自動で再試行されます。',
      submissionId: payload.submissionId
    };
  }
}

// =========================================================================
// ユーザー向け google.script.run API
// =========================================================================

/**
 * フォーム定義を取得する。
 * @returns {object}
 */
function getFormDefinition() {
  return FormService_getFormDefinition();
}

/**
 * 回答を送信する。
 * @param {object} payload
 * @returns {object}
 */
function submitAnswer(payload) {
  return processSubmission_(payload);
}

// =========================================================================
// 初期設定（setup.html）向け google.script.run API（初回は assertSetupApiAccess_ で解放）
// =========================================================================

/**
 * 保存済みのフォーム・ログ先を返す（未設定は空文字）
 * @returns {{ formId: string, oplogSheetId: string }}
 */
function getSettings() {
  assertSetupApiAccess_();
  return SettingsService_getSettings();
}

/**
 * フォームとログ保存先を保存し、回答者向けURLを組み立てて返す
 * @param {{ formId?: string, oplogSheetId?: string }} data
 * @returns {object}
 */
function saveSettings(data) {
  assertSetupApiAccess_();
  return SettingsService_saveSettings(data);
}

/**
 * 回答者向けURL（クエリなし）を返す
 * @param {string} [uiLang] - 'en' でメッセージを英語化
 * @returns {{ success: boolean, wrapperUrl?: string, message?: string, recovery?: string }}
 */
function buildWrapperUrl(uiLang) {
  assertSetupApiAccess_();
  var r = SettingsService_buildWrapperUrl(uiLang);
  if (r.url) {
    return { success: true, wrapperUrl: r.url };
  }
  return {
    success: false,
    message: r.error,
    recovery: r.recovery
  };
}

// =========================================================================
// 管理者向け google.script.run API（すべて assertAdmin_() 必須）
// =========================================================================

/**
 * 管理者画面用: FAILED一覧を取得する。
 * @returns {object[]}
 */
function getFailedRecords() {
  assertAdmin_();

  var sheet = OpLog_getSheet_();
  var data = sheet.getDataRange().getValues();
  var results = [];

  var failStatuses = [
    OPLOG_STATUS.STALE_RECEIVED,
    OPLOG_STATUS.FAILED_TRANSIENT,
    OPLOG_STATUS.FAILED_PERMANENT,
    OPLOG_STATUS.ABANDONED
  ];

  for (var i = 1; i < data.length; i++) {
    var status = data[i][OPLOG_COLUMNS.STATUS];
    if (failStatuses.indexOf(status) !== -1) {
      results.push({
        rowNumber: i + 1,
        submissionId: data[i][OPLOG_COLUMNS.SUBMISSION_ID],
        status: status,
        receivedAt: data[i][OPLOG_COLUMNS.RECEIVED_AT],
        errorType: data[i][OPLOG_COLUMNS.ERROR_TYPE],
        errorMessage: data[i][OPLOG_COLUMNS.ERROR_MESSAGE],
        retryCount: data[i][OPLOG_COLUMNS.RETRY_COUNT]
      });
    }
  }

  return results;
}

/**
 * 管理者画面用: 直近24時間の成功率を取得する。
 * @returns {{ total: number, submitted: number, failed: number, rate: number }}
 */
function getSuccessRate24h() {
  assertAdmin_();

  var sheet = OpLog_getSheet_();
  var data = sheet.getDataRange().getValues();
  var now = new Date();
  var oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  var total = 0;
  var submitted = 0;
  var failed = 0;

  for (var i = 1; i < data.length; i++) {
    var receivedAt = new Date(data[i][OPLOG_COLUMNS.RECEIVED_AT]);
    if (receivedAt >= oneDayAgo) {
      total++;
      if (data[i][OPLOG_COLUMNS.STATUS] === OPLOG_STATUS.SUBMITTED) {
        submitted++;
      } else if (data[i][OPLOG_COLUMNS.STATUS] !== OPLOG_STATUS.RECEIVED) {
        failed++;
      }
    }
  }

  return {
    total: total,
    submitted: submitted,
    failed: failed,
    rate: total > 0 ? Math.round((submitted / total) * 100) : 100
  };
}

/**
 * 管理者画面用: 手動再送を実行する。
 * §8.2: 管理者がFAILEDレコードを選択して再送。
 *
 * 管理者が明示的に実行するため、FAILED_PERMANENT や ABANDONED も再試行可能。
 * ただし revision hash が不一致なら再送不可（回答データの手動確認を促す）。
 *
 * @param {number} rowNumber - Op Logの行番号
 * @returns {{ success: boolean, message: string }}
 */
function manualRetry(rowNumber) {
  assertAdmin_();

  var target = OpLog_getRowData(rowNumber);
  if (target === null) {
    return { success: false, message: '対象レコードが見つかりません (行: ' + rowNumber + ')' };
  }

  // 再送可能なステータスか確認
  var retryableStatuses = [
    OPLOG_STATUS.STALE_RECEIVED,
    OPLOG_STATUS.FAILED_TRANSIENT,
    OPLOG_STATUS.FAILED_PERMANENT,
    OPLOG_STATUS.ABANDONED
  ];
  if (retryableStatuses.indexOf(target.status) === -1) {
    return { success: false, message: 'このステータスでは再送できません: ' + target.status };
  }

  // §6.3: revision hash 照合
  var currentFormDef = FormService_getFormDefinition();
  if (target.formRevisionHash !== currentFormDef.formRevisionHash) {
    return {
      success: false,
      message: 'フォーム構造が変更されています。回答データを確認し、手動でフォームに入力してください。'
    };
  }

  // responseData の復元（Drive退避対応）
  var responseDataJson = target.responseData;
  if (typeof responseDataJson === 'string' && responseDataJson.indexOf('drive:') === 0) {
    var fileId = responseDataJson.replace('drive:', '');
    var file = DriveApp.getFileById(fileId);
    responseDataJson = file.getBlob().getDataAsString();
  }

  var answers;
  try {
    answers = JSON.parse(responseDataJson);
  } catch (e) {
    return { success: false, message: '回答データのパースに失敗: ' + e.message };
  }

  // リトライ回数インクリメント
  OpLog_incrementRetry(rowNumber, target.retryCount);

  // Submit 実行
  var result = SubmitService_submit(currentFormDef, answers);

  if (result.success) {
    OpLog_updateStatus(rowNumber, OPLOG_STATUS.SUBMITTED, {
      submittedAt: new Date().toISOString()
    });
    return { success: true, message: '再送成功: ' + target.submissionId };
  } else {
    OpLog_updateStatus(rowNumber, OPLOG_STATUS.FAILED_TRANSIENT, {
      errorType: result.errorType,
      errorMessage: result.errorMessage
    });
    return { success: false, message: '再送失敗: ' + result.errorMessage };
  }
}

// =========================================================================
// 内部ヘルパー
// =========================================================================

/**
 * §7.2: ユーザー情報を取得する（優先順位付き）。
 * @returns {{ email: string, tempKey: string }}
 * @private
 */
function getUserInfo_() {
  var email = '';
  var tempKey = '';

  try {
    email = Session.getActiveUser().getEmail();
  } catch (e) {
    console.log('getActiveUser 失敗: ' + e.message);
  }

  try {
    tempKey = Session.getTemporaryActiveUserKey();
  } catch (e) {
    console.log('getTemporaryActiveUserKey 失敗: ' + e.message);
  }

  return { email: email, tempKey: tempKey };
}

/**
 * バリデーションエラーコードに対するユーザー向けメッセージを返す。
 * @param {string} errorCode
 * @returns {string}
 * @private
 */
function getValidationErrorMessage_(errorCode) {
  if (errorCode === 'REVISION_MISMATCH') {
    return '設問が更新されました。画面を再読み込みしてください。';
  }
  if (errorCode === 'WEBAPP_VERSION_MISMATCH') {
    return 'システムが更新されました。画面を再読み込みしてください。';
  }
  if (errorCode === 'INVALID_SUBMISSION_ID') {
    return '送信IDが不正です。画面を再読み込みしてください。';
  }
  if (errorCode.indexOf('REQUIRED_MISSING') === 0) {
    return '必須項目が未入力です。';
  }
  if (errorCode.indexOf('INVALID_CHOICE') === 0) {
    return '選択肢が不正です。画面を再読み込みしてください。';
  }
  if (errorCode.indexOf('TEXT_TOO_LONG') === 0) {
    return '入力文字数が上限を超えています。';
  }
  return '入力内容に問題があります。';
}
