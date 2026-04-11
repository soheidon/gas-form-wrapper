/**
 * submitService.js — FormApp.submit 実行・エラー分類
 *
 * 仕様書参照: §3.2（回答送信）、§6.1（WALパターン）、§6.4（エラー分類）
 */

/**
 * フォームに回答を送信する。
 * §3.2: Op Log RECEIVED 記録後に呼ばれる。
 * §9.2: この関数内ではロックを保持しない。
 *
 * @param {object} formDef - FormService_getFormDefinition() の結果
 * @param {object} answers - { itemId: value, ... }
 * @returns {{ success: boolean, errorType: string|null, errorMessage: string|null }}
 */
function SubmitService_submit(formDef, answers) {
  try {
    var formId = Config_get(CONFIG_KEYS.FORM_ID);
    var form = FormApp.openById(formId);
    var formResponse = form.createResponse();

    for (var i = 0; i < formDef.items.length; i++) {
      var item = formDef.items[i];
      if (item.type === 'PAGE_BREAK' || item.type === 'SECTION_HEADER') {
        continue;
      }

      var answer = Answers_lookup_(answers, item.id);

      // 未回答はスキップ
      if (answer === undefined || answer === null || answer === '') {
        continue;
      }
      if (Array.isArray(answer) && answer.length === 0) {
        continue;
      }
      if (item.type === 'GRID' && Array.isArray(answer)) {
        var gridAllEmpty = answer.every(function(x) {
          return x === undefined || x === null || x === '';
        });
        if (gridAllEmpty) continue;
      }
      if (item.type === 'CHECKBOX_GRID' && Array.isArray(answer)) {
        var cgAllEmpty = answer.every(function(row) {
          return !row || row.length === 0;
        });
        if (cgAllEmpty) continue;
      }

      var itemResponse = SubmitService_createItemResponse_(form, item, answer);
      if (itemResponse !== null) {
        formResponse.withItemResponse(itemResponse);
      }
    }

    formResponse.submit();

    return { success: true, errorType: null, errorMessage: null };

  } catch (e) {
    var classified = SubmitService_classifyError_(e);
    console.log('Submit失敗: ' + classified.errorType + ' - ' + e.message);
    return {
      success: false,
      errorType: classified.errorType,
      errorMessage: e.message
    };
  }
}

/**
 * 設問タイプに応じた ItemResponse を生成する。
 *
 * @param {GoogleAppsScript.Forms.Form} form
 * @param {object} item - フォーム定義上の設問
 * @param {*} answer - 回答値
 * @returns {GoogleAppsScript.Forms.ItemResponse|null}
 * @private
 */
function SubmitService_createItemResponse_(form, item, answer) {
  if (item.type === 'PAGE_BREAK' || item.type === 'SECTION_HEADER') {
    return null;
  }

  // FormApp.openById で取得した form から Item を直接取得
  var formItem = form.getItemById(item.id);
  if (formItem === null) {
    throw new Error('設問が見つかりません (itemId: ' + item.id + ')。フォームが変更された可能性があります。');
  }

  switch (item.type) {
    case 'TEXT':
      return formItem.asTextItem().createResponse(String(answer));

    case 'PARAGRAPH_TEXT':
      return formItem.asParagraphTextItem().createResponse(String(answer));

    case 'MULTIPLE_CHOICE':
      return formItem.asMultipleChoiceItem().createResponse(String(answer));

    case 'LIST':
      return formItem.asListItem().createResponse(String(answer));

    case 'CHECKBOX':
      // チェックボックスは文字列配列
      var arr = Array.isArray(answer) ? answer : [answer];
      return formItem.asCheckboxItem().createResponse(arr);

    case 'GRID':
      return SubmitService_createGridResponse_(formItem.asGridItem(), item, answer);

    case 'CHECKBOX_GRID':
      return SubmitService_createCheckboxGridResponse_(formItem.asCheckboxGridItem(), item, answer);

    default:
      console.log('非対応の設問タイプ: ' + item.type);
      return null;
  }
}

/**
 * 単一選択グリッドの ItemResponse を生成する。
 *
 * @param {GoogleAppsScript.Forms.GridItem} gridItem
 * @param {object} item - フォーム定義
 * @param {*} answer
 * @returns {GoogleAppsScript.Forms.ItemResponse}
 * @private
 */
function SubmitService_createGridResponse_(gridItem, item, answer) {
  var rows = item.gridRows || [];
  var ans = Array.isArray(answer) ? answer : [];
  var responses = [];
  for (var i = 0; i < rows.length; i++) {
    var v = ans[i];
    if (v === undefined || v === null || v === '') {
      responses.push(null);
    } else {
      responses.push(String(v).trim());
    }
  }
  return gridItem.createResponse(responses);
}

/**
 * チェックボックスグリッドの ItemResponse を生成する。
 *
 * @param {GoogleAppsScript.Forms.CheckboxGridItem} cgItem
 * @param {object} item
 * @param {*} answer - String[][]
 * @returns {GoogleAppsScript.Forms.ItemResponse}
 * @private
 */
function SubmitService_createCheckboxGridResponse_(cgItem, item, answer) {
  var rows = item.gridRows || [];
  var ans = Array.isArray(answer) ? answer : [];
  var responses = [];
  for (var r = 0; r < rows.length; r++) {
    var rowAns = ans[r];
    if (!rowAns || rowAns.length === 0) {
      responses.push(null);
    } else {
      responses.push(rowAns.map(function(v) {
        return String(v).trim();
      }));
    }
  }
  return cgItem.createResponse(responses);
}

/**
 * エラーを分類する。
 * §6.4: 一時エラー（FAILED_TRANSIENT）と恒久エラー（FAILED_PERMANENT）を区別。
 *
 * @param {Error} error
 * @returns {{ errorType: string, isPermanent: boolean }}
 * @private
 */
function SubmitService_classifyError_(error) {
  var msg = error.message || '';

  // 恒久エラー（再送しても成功しない）
  if (msg.indexOf('does not exist') !== -1 || msg.indexOf('not found') !== -1) {
    return { errorType: 'FORM_DELETED', isPermanent: true };
  }
  if (msg.indexOf('permission') !== -1 || msg.indexOf('access') !== -1) {
    return { errorType: 'PERMISSION_ERROR', isPermanent: true };
  }
  if (msg.indexOf('設問が見つかりません') !== -1) {
    return { errorType: 'ITEM_NOT_FOUND', isPermanent: true };
  }

  // 一時エラー（再送で回復する可能性あり）
  if (msg.indexOf('timeout') !== -1 || msg.indexOf('Timeout') !== -1) {
    return { errorType: 'TIMEOUT', isPermanent: false };
  }
  if (msg.indexOf('quota') !== -1 || msg.indexOf('Quota') !== -1) {
    return { errorType: 'QUOTA_EXCEEDED', isPermanent: false };
  }
  if (msg.indexOf('Service invoked too many') !== -1) {
    return { errorType: 'RATE_LIMIT', isPermanent: false };
  }

  // 分類不能 → 一時エラーとして扱う（再送を試みる）
  return { errorType: 'UNKNOWN', isPermanent: false };
}
