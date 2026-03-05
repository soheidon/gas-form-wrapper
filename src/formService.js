/**
 * formService.js — フォーム定義の読み出し・revision hash生成
 *
 * 仕様書参照: §3.1（設問の配信）、§5.1（revision hash）
 */

/**
 * フォーム定義をUI生成用JSONとして取得する。
 * §3.1: itemId, title, helpText, type, choices, required, validation を返す。
 *
 * @returns {object} { items: Array, formRevisionHash: string, publishedAt: string, webAppVersion: string }
 */
function FormService_getFormDefinition() {
  var formId = Config_get(CONFIG_KEYS.FORM_ID);
  var form = FormApp.openById(formId);
  var items = form.getItems();
  var result = [];

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var parsed = FormService_parseItem_(item);
    if (parsed !== null) {
      result.push(parsed);
    }
  }

  // itemId昇順でソート（hash生成の安定性のため）
  result.sort(function(a, b) { return a.id - b.id; });

  var hash = FormService_generateRevisionHash_(result);

  return {
    items: result,
    formRevisionHash: hash,
    publishedAt: new Date().toISOString(),
    webAppVersion: Config_get(CONFIG_KEYS.WEBAPP_VERSION, CONFIG_DEFAULTS.WEBAPP_VERSION)
  };
}

/**
 * 個別の設問をパースする。
 * §4.1: Phase 1 対応タイプ — SHORT_TEXT, PARAGRAPH, MULTIPLE_CHOICE, CHECKBOX, LIST
 * §4.2: 非対応タイプは null を返す（UIに表示しない）
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
      base.choices = FormService_extractChoices_(mcItem.getChoices());
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

    default:
      // §4.2: 非対応タイプ
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
      return {
        id: item.id,
        type: item.type,
        required: item.required,
        choices: item.choices
      };
    })
  });

  var rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, hashInput);
  var hex = rawHash.map(function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');

  return hex.substring(0, 32);
}
