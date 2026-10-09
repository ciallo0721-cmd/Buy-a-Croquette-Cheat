//=============================================================================
// notice_test.js —— 开局版权声明对话框 · 离线行为验证
//
// 做法：把游戏真实的事件指令表（Map002 EV17 page0 —— 实机跑的就是这张图，
//       从「知道了……」那条对白起到任务目标横幅弹完）交给一份
//       「从游戏本体 rpg_objects.js 原样抽取」的解释器原型，
//       再加载改过的 KC_InfiniteCroquette.js，跑一遍看消息队列顺序。
//
// 断言：
//   1. 声明框恰好出现在「知道了……」和任务目标横幅之间
//   2. 声明框 7 行文案、无头像、普通窗口、底部位置
//   3. 声明框一局只弹一次；同局重跑不重复；开新档恢复
//   4. 后续横幅流程（图片 + 空文本占位）不受影响
//=============================================================================
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const GAME   = 'I:/SteamLibrary/steamapps/common/Buy a Croquette';
const PLUGIN = path.join(__dirname, '..', 'plugin', 'KC_InfiniteCroquette.js');
const MAPFILE = 'Map002.json';
const EVENTID = 17;

//---------------------------------------------------------------------------
// 1. 从游戏本体原样抽取解释器方法（保证行为与真机一致）
//---------------------------------------------------------------------------
const objectsSrc = fs.readFileSync(path.join(GAME, 'www/js/rpg_objects.js'), 'utf8');
function extract(name) {
    const head = 'Game_Interpreter.prototype.' + name + ' =';
    const i = objectsSrc.indexOf(head);
    if (i < 0) { return ''; }        // 引擎没有这个方法（例如 command412）→ 跳过
    const j = objectsSrc.indexOf('\n};', i);
    return objectsSrc.slice(i, j + 3);
}
const METHODS = ['initialize', 'clear', 'currentCommand', 'nextEventCode',
                 'executeCommand', 'command101', 'command111', 'command411',
                 'skipBranch', 'setWaitMode',
                 'setupChoices', 'setupNumInput', 'setupItemChoice'];

//---------------------------------------------------------------------------
// 2. 组装最小可运行环境
//---------------------------------------------------------------------------
const messages = [];          // 记录所有弹出的消息框
let curMsg = null;
const switches = {};

function resetMessages() { messages.length = 0; curMsg = null; }

const sandbox = {};
sandbox.global = sandbox;

sandbox.PluginManager = { parameters: () => ({
    'Starting Gold': '380', 'Croquette Item ID': '2',
    'Croquette Amount': '99', 'Infinite Mode': 'always'
}) };

sandbox.$dataItems    = [null, null, { id: 2, name: '市村可乐饼' }];
sandbox.$gameSwitches = {
    value: id => !!switches[id],
    setValue(id, v) { switches[id] = v; }
};
sandbox.$gameVariables = { value: () => 0 };
sandbox.AudioManager   = { playMe(){}, fadeOutBgm(){}, playBgm(){}, playSe(){} };
sandbox.SceneManager   = { _scene: null };
sandbox.$gameParty     = { gold: () => 0, gainGold(){}, numItems: () => 0, gainItem(){} };

sandbox.Game_Party = function() {};
sandbox.Game_Party.prototype = { loseItem(){}, consumeItem(){} };

sandbox.DataManager = { setupNewGame() {}, loadGame() {} };
sandbox.Scene_Map   = function() {};
sandbox.Scene_Map.prototype = { start(){}, update(){} };

sandbox.$gameMessage = {
    _faceName: '', _faceIndex: 0, _background: 0, _positionType: 2,
    _texts: [], _choices: [],
    setFaceImage(n, i) { this._faceName = n; this._faceIndex = i; },
    setBackground(b) { this._background = b; },
    setPositionType(p) { this._positionType = p; },
    add(t) { this._texts.push(String(t)); },
    isBusy() { return this._texts.length > 0 || this._choices.length > 0; },
    clear() { this._texts = []; this._choices = []; }
};

// 解释器原型：只挂载抽出来的真方法 + 必要的空实现
sandbox.Game_Interpreter = function() {};
const methodSrc = METHODS.map(extract).join('\n');
vm.runInNewContext(
    'var Game_Interpreter = this.Game_Interpreter;\n' + methodSrc,
    sandbox,
    { filename: 'extracted_interpreter.js' }
);

vm.createContext(sandbox);

//---------------------------------------------------------------------------
// 3. 加载被测试的插件
//---------------------------------------------------------------------------
vm.runInContext(fs.readFileSync(PLUGIN, 'utf8'), sandbox, { filename: 'plugin.js' });

//---------------------------------------------------------------------------
// 4. 取真实事件指令表
//---------------------------------------------------------------------------
const map  = JSON.parse(fs.readFileSync(path.join(GAME, 'www/data', MAPFILE), 'utf8'));
const ev   = map.events.find(e => e && e.id === EVENTID);
const full = ev.pages[0].list;

const startIdx = full.findIndex((c, i) =>
    c.code === 101 &&
    full[i + 1] && full[i + 1].code === 401 && String(full[i + 1].parameters[0]) === '青空千绪' &&
    full[i + 2] && full[i + 2].code === 401 && String(full[i + 2].parameters[0]).indexOf('知道了') === 0
);
if (startIdx < 0) { throw new Error('没找到「知道了……」对白'); }
const endIdx = startIdx + 20 + 14;   // 20 覆盖原流程；+14 = 插件插入的 7 页声明（每页 101+401）

// 与 KC_InfiniteCroquette.js 的 NOTICE_LINES 保持一致
const NOTICE = [
    '本补丁仅供个人单机娱乐与学习交流使用',
    '请勿用于任何商业用途',
    '不要传播经过修改的游戏本体',
    '游戏版权归原作者所有',
    '使用本补丁产生的一切后果由使用者自行承担',
    '作者   : ciallo0721-cmd',
    'Enjoy your 380$'
];

//---------------------------------------------------------------------------
// 5. 驱动器：模拟玩家读完每条消息
//---------------------------------------------------------------------------
function drive(list, fromIdx, toIdx) {
    const interp = new sandbox.Game_Interpreter();
    interp._list = list;
    interp._index = fromIdx;
    interp._branch = {};
    interp._waitMode = '';
    interp._waitCount = 0;

    let guard = 0;
    while (interp._index < toIdx && guard++ < 20000) {
        if (interp._waitMode === 'message') {
            if (curMsg) { messages.push(curMsg); curMsg = null; }
            sandbox.$gameMessage.clear();
            interp._waitMode = '';
            continue;
        }
        const before = interp._index;
        interp.executeCommand();
        if (sandbox.$gameMessage._texts.length > 0) {
            curMsg = {
                face: sandbox.$gameMessage._faceName,
                faceIdx: sandbox.$gameMessage._faceIndex,
                bg:   sandbox.$gameMessage._background,
                pos:  sandbox.$gameMessage._positionType,
                texts: sandbox.$gameMessage._texts.slice()
            };
            sandbox.$gameMessage.clear();
        }
        if (interp._index === before && interp._waitMode !== 'message') { break; }
    }
    if (curMsg) { messages.push(curMsg); curMsg = null; }
    return interp;
}

//---------------------------------------------------------------------------
// 6. 执行 + 断言
//---------------------------------------------------------------------------
let pass = 0, fail = 0;
function check(desc, cond, extra) {
    if (cond) { pass++; console.log('  \u2713 ' + desc); }
    else { fail++; console.log('  \u2717 ' + desc + (extra ? '  → ' + extra : '')); }
}

console.log('事件：' + MAPFILE + ' EV' + EVENTID + ' page0，下标 ' + startIdx +
            ' → ' + endIdx + '（实机开局走的就是这条）\n');

switches[56] = true;               // 该开关为 ON → 走 250 円 分支（与实机一致）
sandbox.DataManager.setupNewGame();   // 模拟开新档 → 复位所有标记
resetMessages();
drive(full.slice(), startIdx, endIdx);   // 传副本：插件会就地插入指令，别污染原始数据

console.log('实际弹出的消息队列：');
messages.forEach((m, i) => {
    console.log('  [' + i + '] face=' + JSON.stringify(m.face) +
                ' bg=' + m.bg + ' pos=' + m.pos + ' lines=' + m.texts.length);
    m.texts.forEach(t => console.log('        ' + (t === '' ? '(空文本)' : t)));
});
console.log('');

const iKnew = messages.findIndex(m => m.texts.join('|').indexOf('知道了') >= 0);
const iNote = messages.findIndex(m => m.texts[0] === NOTICE[0]);
const pages = iNote >= 0 ? messages.slice(iNote, iNote + NOTICE.length) : [];
const iTask = iNote >= 0 ? iNote + NOTICE.length : -1;

console.log('位置定位：知道了…… → #' + iKnew + '，声明首页 → #' + iNote +
            '，横幅占位 → #' + iTask + '\n');

check('关键消息框都被捕获', iKnew >= 0 && iNote >= 0 && iTask >= 0);
check('顺序正确：知道了…… 在声明之前', iKnew < iNote, iKnew + ' < ' + iNote);
check('声明紧随知道了…… 之后', iNote === iKnew + 1, iNote + ' ≠ ' + (iKnew + 1));

// ---- 核心：一行一页，7 页彼此独立，可逐页跳过 ----
check('声明共 7 页独立对话框', pages.length === 7, '实际 ' + pages.length);
check('每页只有 1 行（一行一页）',
      pages.length === 7 && pages.every(p => p.texts.length === 1),
      JSON.stringify(pages.map(p => p.texts.length)));
NOTICE.forEach((line, i) => {
    check('第 ' + (i + 1) + ' 页：' + line,
          !!pages[i] && pages[i].texts[0] === line,
          JSON.stringify(pages[i] && pages[i].texts[0]));
});
check('每页都带 qianxu4 立绘',
      pages.length === 7 && pages.every(p => p.face === 'qianxu4' && p.faceIdx === 0),
      JSON.stringify(pages.map(p => p.face)));
check('每页都是普通窗口 bg=0 / 底部 pos=2',
      pages.length === 7 && pages.every(p => p.bg === 0 && p.pos === 2),
      JSON.stringify(pages.map(p => p.bg + '/' + p.pos)));

check('声明之后就是任务目标横幅的空文本占位',
      iTask > iNote && messages[iTask] && messages[iTask].texts.length === 1 &&
      messages[iTask].texts[0] === '',
      JSON.stringify(messages[iTask] && messages[iTask].texts));

const task = messages[iTask] || { texts: [] };
check('横幅占位消息参数未被破坏 bg=2 pos=1', task.bg === 2 && task.pos === 1,
      'bg=' + task.bg + ' pos=' + task.pos);

const noteCount = messages.filter(m => m.texts[0] === NOTICE[0]).length;
check('一局内声明只出现一次', noteCount === 1, '出现 ' + noteCount + ' 次');

// 同局重跑事件（页面条件变化再触发）不应再弹
resetMessages();
drive(full.slice(), startIdx, endIdx);   // 传副本：插件会就地插入指令，别污染原始数据
const noteCount2 = messages.filter(m => m.texts[0] === '本补丁仅供个人单机娱乐与学习交流使用').length;
check('同局重跑同一事件不再弹声明', noteCount2 === 0, '又弹了 ' + noteCount2 + ' 次');

// 开新档后应恢复
resetMessages();
sandbox.DataManager.setupNewGame();
drive(full.slice(), startIdx, endIdx);   // 传副本：插件会就地插入指令，别污染原始数据
const noteCount3 = messages.filter(m => m.texts[0] === '本补丁仅供个人单机娱乐与学习交流使用').length;
check('开新档后声明框恢复正常显示', noteCount3 === 1, '出现 ' + noteCount3 + ' 次');

console.log('\n────────────────────────────────');
console.log('通过 ' + pass + ' / ' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
