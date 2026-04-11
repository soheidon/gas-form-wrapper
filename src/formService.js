/**
 * formService.js — フォーム定義の読み出し・revision hash生成
 *
 * 仕様書参照: §3.1（設問の配信）、§5.1（revision hash）
 */

/**
 * h1 / ブラウザタブ用の表示タイトルのみ。本文のセクション・設問とは独立。
 * 1) Drive のファイル名（拡張子除く） 2) form.getTitle() 3) 固定「アンケート」
 *
 * @param {GoogleAppsScript.Forms.Form} form
 * @param {string} formId - Script Properties の FORM_ID
 * @returns {string}
 * @private
 */
function FormService_resolveFormTitle_(form, formId) {
  try {
    var fid = formId || form.getId();
    var file = DriveApp.getFileById(fid);
    var nm = String(file.getName() || '').trim();
    if (nm) {
      var stripped = nm.replace(/\.gform$/i, '').replace(/\.form$/i, '').trim();
      if (stripped) return stripped;
    }
  } catch (eDrive) {
    // Drive 権限・ID 不一致など
  }
  try {
    var t = String(form.getTitle() || '').trim();
    if (t) return t;
  } catch (eTitle) {
    // ignore
  }
  return 'アンケート';
}

/**
 * 複数選択の 1 選択肢に対するページ遷移（回答に応じてセクションに移動 等）。
 *
 * @param {GoogleAppsScript.Forms.Choice} choice
 * @returns {{ type: string, pageBreakId: (number|undefined) }}
 * @private
 */
function FormService_parseChoiceNavigation_(choice) {
  try {
    var nt = choice.getPageNavigationType();
    if (nt === FormApp.PageNavigationType.SUBMIT) {
      return { type: 'SUBMIT' };
    }
    if (nt === FormApp.PageNavigationType.RESTART) {
      return { type: 'RESTART' };
    }
    if (nt === FormApp.PageNavigationType.CONTINUE) {
      return { type: 'CONTINUE' };
    }
    if (nt === FormApp.PageNavigationType.GO_TO_PAGE) {
      var gp = choice.getGotoPage();
      if (gp) {
        return { type: 'GO_TO_PAGE', pageBreakId: gp.getId() };
      }
      return { type: 'CONTINUE' };
    }
  } catch (eNav) {
    // ignore
  }
  return { type: 'CONTINUE' };
}

/**
 * フォーム定義をUI生成用JSONとして取得する。
 * §3.1: itemId, title, helpText, type, choices, required, validation を返す。
 *
 * @returns {object} formDef（items, formTitle, formDescription, pageBreakIdToSectionNumber, itemSectionByItemId, …）
 */
function FormService_getFormDefinition() {
  var formId = Config_get(CONFIG_KEYS.FORM_ID);
  var form = FormApp.openById(formId);
  var items = form.getItems();
  var result = [];

  // getItems() はフォーム上の表示順（改ページ・セクション含む）
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var parsed = FormService_parseItem_(item);
    if (parsed !== null) {
      result.push(parsed);
    }
  }

  var hash = FormService_generateRevisionHash_(result);

  var formDescription = '';
  var formTitle = '';
  try {
    formDescription = String(form.getDescription() || '').trim();
  } catch (e1) {
    formDescription = '';
  }
  formTitle = FormService_resolveFormTitle_(form, formId);

  var pageBreakIdToSectionNumber = {};
  var nextSecAfterBreak = 2;
  for (var pi = 0; pi < result.length; pi++) {
    if (result[pi].type === 'PAGE_BREAK') {
      pageBreakIdToSectionNumber[String(result[pi].id)] = nextSecAfterBreak;
      nextSecAfterBreak++;
    }
  }

  var itemSectionByItemId = {};
  var curSection = 1;
  for (var qi = 0; qi < result.length; qi++) {
    var pit = result[qi];
    if (pit.type === 'PAGE_BREAK') {
      curSection++;
      continue;
    }
    if (pit.type === 'SECTION_HEADER') {
      continue;
    }
    itemSectionByItemId[String(pit.id)] = curSection;
  }

  return {
    items: result,
    formTitle: formTitle,
    formDescription: formDescription,
    pageBreakIdToSectionNumber: pageBreakIdToSectionNumber,
    itemSectionByItemId: itemSectionByItemId,
    formRevisionHash: hash,
    publishedAt: new Date().toISOString(),
    webAppVersion: Config_get(CONFIG_KEYS.WEBAPP_VERSION, CONFIG_DEFAULTS.WEBAPP_VERSION)
  };
}

/**
 * 個別の設問をパースする。
 * 対応タイプ: TEXT, PARAGRAPH_TEXT, MULTIPLE_CHOICE, CHECKBOX, LIST,
 * PAGE_BREAK, SECTION_HEADER, GRID, CHECKBOX_GRID
 * 非対応タイプは null（スキップ）
 *
 * @param {GoogleAppsScript.Forms.Item} item
 * @returns {object|null}
 * @private
 */
function FormService_parseItem_(item) {
  var type = item.getType();
  var base = {
    id: item.getId(),
    title: item.getTitle(),
    helpText: item.getHelpText(),
    type: type.toString(),
    required: false,
    choices: [],
    validation: null
  };

  switch (type) {
    case FormApp.ItemType.TEXT:
      var textItem = item.asTextItem();
      base.required = textItem.isRequired();
      break;

    case FormApp.ItemType.PARAGRAPH_TEXT:
      var paraItem = item.asParagraphTextItem();
      base.required = paraItem.isRequired();
      break;

    case FormApp.ItemType.MULTIPLE_CHOICE:
      var mcItem = item.asMultipleChoiceItem();
      base.required = mcItem.isRequired();
      var mcChoices = mcItem.getChoices();
      base.choices = FormService_extractChoices_(mcChoices);
      base.choiceNavigations = [];
      for (var nvi = 0; nvi < mcChoices.length; nvi++) {
        base.choiceNavigations.push(FormService_parseChoiceNavigation_(mcChoices[nvi]));
      }
      while (base.choiceNavigations.length < base.choices.length) {
        base.choiceNavigations.push({ type: 'CONTINUE' });
      }
      break;

    case FormApp.ItemType.CHECKBOX:
      var cbItem = item.asCheckboxItem();
      base.required = cbItem.isRequired();
      base.choices = FormService_extractChoices_(cbItem.getChoices());
      break;

    case FormApp.ItemType.LIST:
      var listItem = item.asListItem();
      base.required = listItem.isRequired();
      base.choices = FormService_extractChoices_(listItem.getChoices());
      break;

    case FormApp.ItemType.PAGE_BREAK:
      base.type = 'PAGE_BREAK';
      break;

    case FormApp.ItemType.SECTION_HEADER:
      base.type = 'SECTION_HEADER';
      break;

    case FormApp.ItemType.GRID:
      var gridItem = item.asGridItem();
      base.type = 'GRID';
      base.required = gridItem.isRequired();
      base.gridRows = gridItem.getRows();
      base.gridColumns = gridItem.getColumns();
      base.choices = [];
      break;

    case FormApp.ItemType.CHECKBOX_GRID:
      var cbGridItem = item.asCheckboxGridItem();
      base.type = 'CHECKBOX_GRID';
      base.required = cbGridItem.isRequired();
      base.gridRows = cbGridItem.getRows();
      base.gridColumns = cbGridItem.getColumns();
      base.choices = [];
      break;

    default:
      console.log('非対応の設問タイプをスキップ: ' + type + ' (itemId: ' + item.getId() + ')');
      return null;
  }

  return base;
}

/**
 * 選択肢を文字列配列に変換する。
 * §5.1: trim() で正規化する（全角半角の正規化はしない）。
 *
 * @param {GoogleAppsScript.Forms.Choice[]} choices
 * @returns {string[]}
 * @private
 */
function FormService_extractChoices_(choices) {
  return choices.map(function(c) {
    return c.getValue().trim();
  });
}

/**
 * revision hash を生成する。
 * §5.1: SHA256 の先頭32文字（128bit）。
 * title, helpText はhashに含めない（ラベル修正は互換変更）。
 *
 * @param {object[]} items - パース済みの設問配列
 * @returns {string} 32文字のhex文字列
 * @private
 */
function FormService_generateRevisionHash_(items) {
  var hashInput = JSON.stringify({
    items: items.map(function(item) {
      var row = {
        id: item.id,
        type: item.type,
        required: item.required,
        choices: item.choices || []
      };
      if (item.choiceNavigations) {
        row.choiceNavigations = item.choiceNavigations;
      }
      if (item.gridRows) {
        row.gridRows = item.gridRows;
      }
      if (item.gridColumns) {
        row.gridColumns = item.gridColumns;
      }
      return row;
    })
  });

  var rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, hashInput);
  var hex = rawHash.map(function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');

  return hex.substring(0, 32);
}
