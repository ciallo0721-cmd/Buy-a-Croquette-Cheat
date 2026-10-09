//=============================================================================
// KC_InfiniteCroquette.js
//-----------------------------------------------------------------------------
// 「买个可乐饼吧！」外挂 · 无限可乐饼
//
//   · 新游戏开局：380 円 初始资金
//   · 新游戏开局：99 个「市村可乐饼」（RPG Maker MV 单格上限）
//   · 无限模式：可乐饼持有数永不低于设定值
//
// 设计要点
//   1. 包裹 DataManager.setupNewGame —— 只在新游戏触发，读档完全不受影响
//   2. 幂等 —— 已达到目标值就不再叠加，重复调用绝对安全
//   3. 只用引擎标准 API(gainItem/gainGold/loseItem) —— 不篡改内部字段，
//      背包上限、物品日志、成就等既有机制全部照常工作
//   4. 队伍替换守护 —— 本作启用 ParallelParty(ShareResource=OFF)，开场剧情会执行
//      `$gameParty = currentParty` 把整个队伍对象换掉，注入的资源会随之丢失。
//      故在首次被替换后补齐一次，随后停止监测（零长期开销）
//=============================================================================
/*:
 * @plugindesc v2.0.0 「买个可乐饼吧！」外挂：380 円初始资金 + 99 个市村可乐饼（无限）
 * @author ciallo0721-cmd
 * @help
 * ============================================================================
 *  买个可乐饼吧！· 无限可乐饼
 * ============================================================================
 *  开新档后自动获得 380 円 与 99 个「市村可乐饼」。
 *
 *  无限模式（Infinite Mode）：
 *    always  —— 数量永远不低于设定值（默认，真·无限）
 *    consume —— 只在使用可乐饼后补满，卖掉/丢弃会正常减少
 *    off     —— 关闭无限，只做开局一次性发放
 *
 *  想改数值请直接改本插件在 plugins.js 里的 parameters，无需改代码。
 */

(function() {
    'use strict';

    var PLUGIN_NAME = 'KC_InfiniteCroquette';
    var params = PluginManager.parameters(PLUGIN_NAME);

    var START_GOLD   = Number(params['Starting Gold']     || 380);
    var CROQUETTE_ID = Number(params['Croquette Item ID'] || 2);
    var CROQUETTE_N  = Number(params['Croquette Amount']  || 99);
    var MODE         = String(params['Infinite Mode']     || 'always').toLowerCase();

    var pending    = false;   // 新游戏后等待注入
    var watchParty = false;   // 注入已成功，监测 $gameParty 是否被整体替换

    // 目标道具（$dataItems 未就绪时返回 null）
    function croquette() {
        if (!$dataItems) { return null; }
        return $dataItems[CROQUETTE_ID] || null;
    }

    // 刷新地图界面上的金钱窗口，让数字立刻可见
    function refreshGoldWindow() {
        var scene = SceneManager._scene;
        if (!scene) { return; }
        var w = scene._goldWindow;
        if (w && typeof w.refresh === 'function') { w.refresh(); }
    }

    // 幂等补齐：低于目标值才补，重复调用安全
    function applyStarterKit() {
        if (!$gameParty) { return false; }
        var item = croquette();
        if (!item) { return false; }

        var owned = $gameParty.numItems(item);
        if (owned < CROQUETTE_N) {
            $gameParty.gainItem(item, CROQUETTE_N - owned, false);
        }

        var gold = $gameParty.gold();
        if (gold < START_GOLD) {
            $gameParty.gainGold(START_GOLD - gold);
        }

        refreshGoldWindow();
        return true;
    }

    function flushStarterKit() {
        if (!pending) { return; }
        try {
            if (applyStarterKit()) {
                pending = false;
                watchParty = true;      // 注入成功，开始守护队伍替换
            }
        } catch (e) { /* 数据未就绪，下次再试 */ }
    }

    // 无限模式：把持有数补回设定值
    function refill() {
        if (MODE === 'off') { return; }
        if (!$gameParty) { return; }
        var item = croquette();
        if (!item) { return; }
        var owned = $gameParty.numItems(item);
        if (owned < CROQUETTE_N) {
            $gameParty.gainItem(item, CROQUETTE_N - owned, false);
        }
    }

    // ---- 无限模式 always：任何消耗途径都补满 ----
    if (MODE === 'always') {
        var _Game_Party_loseItem = Game_Party.prototype.loseItem;
        Game_Party.prototype.loseItem = function(item, amount, includeEquip) {
            _Game_Party_loseItem.call(this, item, amount, includeEquip);
            if (item && item.id === CROQUETTE_ID) { refill(); }
        };
    }

    // ---- 无限模式 consume：只在使用道具后补满（不影响商店买卖） ----
    if (MODE === 'consume') {
        var _Game_Party_consumeItem = Game_Party.prototype.consumeItem;
        Game_Party.prototype.consumeItem = function(item) {
            _Game_Party_consumeItem.call(this, item);
            if (item && item.id === CROQUETTE_ID) { refill(); }
        };
    }

    // 监测 $gameParty 对象身份；被整体替换后（ParallelParty 开场切队伍）补齐一次
    var _lastParty = null;
    function checkPartyIdentity() {
        if (!watchParty) { return; }                    // 未在守护期，零开销
        if ($gameParty === _lastParty) { return; }
        _lastParty = $gameParty;
        watchParty = false;                             // 只守护开场这一次切换
        applyStarterKit();
    }

    // ---- 主注入点：新游戏 ----
    var _DataManager_setupNewGame = DataManager.setupNewGame;
    DataManager.setupNewGame = function() {
        _DataManager_setupNewGame.call(this);
        pending = true;
        watchParty = false;
        _lastParty = $gameParty;
        flushStarterKit();
    };

    // ---- 场景入口：兜底注入 + 队伍身份检查 ----
    var _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        flushStarterKit();
        checkPartyIdentity();
        _Scene_Map_start.call(this);
    };

    var _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        checkPartyIdentity();
    };

    // ---- 读档：清除所有标记，绝不污染存档流程 ----
    var _DataManager_loadGame = DataManager.loadGame;
    DataManager.loadGame = function(savefileId) {
        pending = false;
        watchParty = false;
        return _DataManager_loadGame.call(this, savefileId);
    };
})();
