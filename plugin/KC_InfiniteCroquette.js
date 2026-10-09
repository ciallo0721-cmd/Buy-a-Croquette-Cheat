//=============================================================================
// KC_InfiniteCroquette.js
//-----------------------------------------------------------------------------
// 「买个可乐饼吧！」外挂 · 无限可乐饼
//
//   · 新游戏开局：380 円 初始资金
//   · 新游戏开局：99 个「市村可乐饼」（RPG Maker MV 单格上限）
//   · 无限模式：可乐饼持有数永不低于设定值
//   · 开局在「知道了……」与「任务目标」之间插入一张版权声明对话框
//
// 设计要点
//   1. 包裹 DataManager.setupNewGame —— 只在新游戏触发，读档完全不受影响
//   2. 幂等 —— 已达到目标值就不再叠加，重复调用绝对安全
//   3. 只用引擎标准 API(gainItem/gainGold/loseItem) —— 不篡改内部字段，
//      背包上限、物品日志、成就等既有机制全部照常工作
//   4. 队伍替换守护 —— 本作启用 ParallelParty(ShareResource=OFF)，开场剧情会执行
//      `$gameParty = currentParty` 把整个队伍对象换掉，注入的资源会随之丢失。
//      故在首次被替换后补齐一次，随后停止监测（零长期开销）
//   5. 声明框 —— 运行时向解释器指令表就地插入 7 页 101/401 指令，
//      一行一页，与游戏原生对白完全同款（可逐页按键跳过 / 长按快进）；
//      只在内存生效，不落盘、不改任何 Map*.json
//=============================================================================
/*:
 * @plugindesc v2.4.0 「买个可乐饼吧！」外挂：380 円初始资金 + 99 个市村可乐饼（无限）+ 开局声明框（逐页可跳过）
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
 *  开局声明框：
 *    开场「知道了……」这条对白结束后、任务目标横幅弹出前，自动插入 7 页
 *    版权声明（默认带 qianxu4 立绘）。一条一行、一页一页显示，
 *    按确定键即可逐页跳过，与游戏原生对白表现完全一致。
 *    想改文案请编辑本文件顶部的 NOTICE_LINES 数组；
 *    想换立绘改 plugins.js 里的 Notice Face 参数（填 none 则不显示立绘）。
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

    //=========================================================================
    //  开局版权声明对话框
    //-------------------------------------------------------------------------
    //  位置：开场「知道了……」之后、「任务目标」横幅之前
    //
    //  实现：RPG Maker MV 的 Show Text(command 101) 会在一条指令里吃掉后面
    //  所有 401 文本行。所以做法是——
    //    a. hook command101，认出「知道了……」这条对白，记下它播完之后
    //       解释器将停在哪条指令上（armedIndex）
    //    b. hook executeCommand，当解释器走到那个下标时，先弹声明框、
    //       setWaitMode('message') 等玩家读完，并且【不推进 _index】
    //       → 玩家读完后再重跑同一条指令，流程无缝衔接
    //  全程不触碰 Map*.json，换地图/改剧情都不会失效
    //=========================================================================
    var NOTICE_LINES = [
        '本补丁仅供个人单机娱乐与学习交流使用',
        '请勿用于任何商业用途',
        '不要传播经过修改的游戏本体',
        '游戏版权归原作者所有',
        '使用本补丁产生的一切后果由使用者自行承担',
        '作者   : ciallo0721-cmd',
        'Enjoy your 380$'
    ];

    var noticeShown = false;    // 本局是否已展示过
    var noticeArmed = false;    // 已定位到「知道了……」，等它播完
    var armedList   = null;     // 定位到的指令表引用（防跨解释器误判）
    var armedIndex  = -1;       // 定位到的指令下标

    // 取出某条 101 指令后面跟着的全部 401 文本
    function showTextLines(list, index) {
        if (!list || !list[index] || list[index].code !== 101) { return null; }
        var out = [];
        for (var k = index + 1; k < list.length; k++) {
            var c = list[k];
            if (!c || c.code !== 401) { break; }
            out.push(String(c.parameters[0]));
        }
        return out;
    }

    // 认出场开那句「知道了……」：紧跟着的若干指令里必有 Fanfare1 音效
    function isOpeningKnew(interp, index) {
        var txt = showTextLines(interp._list, index);
        if (!txt || txt.length < 2) { return false; }
        if (String(txt[1]).indexOf('知道了') !== 0) { return false; }
        var list = interp._list;
        for (var k = index + 1; k <= index + 8 && k < list.length; k++) {
            var c = list[k];
            if (c && c.code === 249 && c.parameters[0] &&
                c.parameters[0].name === 'Fanfare1') {
                return true;
            }
        }
        return false;
    }

    // 声明框立绘：默认 qianxu4；填 none / off 则不显示立绘
    var _faceParam = String(params['Notice Face'] === undefined ? 'qianxu4'
                                                                : params['Notice Face']).trim();
    var _faceLow   = _faceParam.toLowerCase();
    var NOTICE_FACE     = (_faceLow === 'none' || _faceLow === 'off' || _faceLow === '') ? '' : _faceParam;
    var NOTICE_FACE_IDX = Number(params['Notice Face Index'] || 0);

    // 一条声明 = 一「页」指令：101(显示文本) + 401(文本行)
    // 101 参数顺序 = [faceName, faceIndex, background, positionType]
    function pushNoticePage(cmds, line) {
        cmds.push({ code: 101, indent: 0,
                    parameters: [NOTICE_FACE, NOTICE_FACE_IDX, 0, 2] });
        cmds.push({ code: 401, indent: 0, parameters: [line] });
    }

    // 七条声明 → 七页独立对话框，玩家可以一页一页按键跳过
    function buildNoticeCommands() {
        var cmds = [];
        for (var i = 0; i < NOTICE_LINES.length; i++) {
            pushNoticePage(cmds, NOTICE_LINES[i]);
        }
        return cmds;
    }

    // (a) 认出「知道了……」，记下对白结束后的落点
    var _Game_Interpreter_command101 = Game_Interpreter.prototype.command101;
    Game_Interpreter.prototype.command101 = function() {
        var here = this._index;
        var result = _Game_Interpreter_command101.call(this);
        if (!noticeShown && !noticeArmed && this._index > here && isOpeningKnew(this, here)) {
            noticeArmed = true;
            armedList   = this._list;
            armedIndex  = this._index;      // 已跳过 401，指向对白后的第一条指令
        }
        return result;
    };

    // (b) 对白播完、下一条指令执行前，把声明指令就地插进指令表
    var _Game_Interpreter_executeCommand = Game_Interpreter.prototype.executeCommand;
    Game_Interpreter.prototype.executeCommand = function() {
        if (noticeArmed && !noticeShown &&
            this._list === armedList && this._index === armedIndex) {
            noticeArmed = false;
            noticeShown = true;
            // 就地把 7 页声明插到当前位置，然后交给引擎照常执行：
            // 引擎自己会一页页显示、一页页等玩家按键 → 与游戏原生对白完全同款，
            // 逐页可跳过、可长按快进、不受任何窗口插件的特殊处理影响
            var cmds = buildNoticeCommands();
            this._list.splice.apply(this._list, [this._index, 0].concat(cmds));
            // _index 保持不动，下一条即插入的第一页
        }
        return _Game_Interpreter_executeCommand.call(this);
    };

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
        noticeShown = false;
        noticeArmed = false;
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
        noticeShown = false;
        noticeArmed = false;
        return _DataManager_loadGame.call(this, savefileId);
    };
})();
