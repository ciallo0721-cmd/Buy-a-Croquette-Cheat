//=============================================================================
// plugin_test.js —— KC_InfiniteCroquette 离线行为测试
//------------------------------------------------------------------------------
// 用最小 RPG Maker MV 运行时桩验证插件行为，不依赖游戏本体。
//   运行:  node plugin_test.js
//=============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PLUGIN = path.join(__dirname, '..', 'plugin', 'KC_InfiniteCroquette.js');
const SRC = fs.readFileSync(PLUGIN, 'utf8');

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) pass++; else fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '   -> ' + extra : ''}`);
}

// ---------------------------------------------------------------------------
// 搭一个最小运行时
// ---------------------------------------------------------------------------
function buildRuntime(params) {
  // Game_Party 桩：只实现本插件用到的成员
  function Game_Party() {
    this._gold = 0;
    this._items = {};          // { itemId: count }
  }
  Game_Party.prototype.gold = function () { return this._gold; };
  Game_Party.prototype.gainGold = function (n) { this._gold += n; };
  Game_Party.prototype.loseGold = function (n) { this._gold = Math.max(0, this._gold - n); };
  Game_Party.prototype.numItems = function (item) { return this._items[item.id] || 0; };
  Game_Party.prototype.gainItem = function (item, n) {
    this._items[item.id] = Math.max(0, (this._items[item.id] || 0) + n);
  };
  Game_Party.prototype.loseItem = function (item, n) {
    this._items[item.id] = Math.max(0, (this._items[item.id] || 0) - n);
  };
  Game_Party.prototype.consumeItem = function (item) {
    this.loseItem(item, 1);      // MV 里 consumeItem 内部就是调 loseItem
  };

  const sandbox = {
    console,
    Game_Party,
    PluginManager: { parameters: () => params },
    $dataItems: { 2: { id: 2, name: '市村可乐饼', consumable: true } },
    $gameParty: new Game_Party(),
    SceneManager: { _scene: null },
    DataManager: {
      setupNewGame() {},
      loadGame(id) { return id; }
    },
    Scene_Map: { prototype: { start() {}, update() {} } },
    // 声明框钩子所需的桩（本条测试不驱动对白，仅保证插件能正常装载）
    Game_Interpreter: {
      prototype: {
        command101() { return true; },
        executeCommand() { return true; },
        setWaitMode() {}
      }
    },
    $gameMessage: {
      _texts: [], _faceName: '', _faceIndex: 0, _background: 0, _positionType: 2,
      setFaceImage() {}, setBackground() {}, setPositionType() {},
      add(t) { this._texts.push(t); }, clear() { this._texts = []; }
    }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return sandbox;
}

const BASE = {
  'Starting Gold': '380',
  'Croquette Item ID': '2',
  'Croquette Amount': '99',
  'Infinite Mode': 'always'
};

function newGame(S) {
  S.DataManager.setupNewGame();
  S.Scene_Map.prototype.start.call({});
  S.Scene_Map.prototype.update.call({});
}

// ===========================================================================
console.log('=== 1. 开局注入（Infinite Mode = always） ===');
{
  const S = buildRuntime(BASE);
  newGame(S);
  t('开局获得 380 円', S.$gameParty.gold() === 380, 'gold=' + S.$gameParty.gold());
  t('开局获得 99 个可乐饼', S.$gameParty.numItems(S.$dataItems[2]) === 99);

  S.Scene_Map.prototype.start.call({});
  S.Scene_Map.prototype.update.call({});
  t('重复进地图不叠加金钱', S.$gameParty.gold() === 380);
  t('重复进地图不叠加物品', S.$gameParty.numItems(S.$dataItems[2]) === 99);

  console.log('--- 无限模式 always：任何途径掉数量都补满 ---');
  S.$gameParty.loseItem(S.$dataItems[2], 1);
  t('消耗 1 个 -> 自动补回 99', S.$gameParty.numItems(S.$dataItems[2]) === 99,
    'n=' + S.$gameParty.numItems(S.$dataItems[2]));
  S.$gameParty.loseItem(S.$dataItems[2], 50);
  t('一次消耗 50 个 -> 也补回 99', S.$gameParty.numItems(S.$dataItems[2]) === 99,
    'n=' + S.$gameParty.numItems(S.$dataItems[2]));
  t('金钱不受物品逻辑影响', S.$gameParty.gold() === 380);
}

// ===========================================================================
console.log('\n=== 2. Infinite Mode = consume（只在使用后补满） ===');
{
  const p = Object.assign({}, BASE, { 'Infinite Mode': 'consume' });
  const S = buildRuntime(p);
  newGame(S);
  t('开局获得 99 个', S.$gameParty.numItems(S.$dataItems[2]) === 99);

  S.$gameParty.consumeItem(S.$dataItems[2]);
  t('使用 1 个 -> 补回 99', S.$gameParty.numItems(S.$dataItems[2]) === 99,
    'n=' + S.$gameParty.numItems(S.$dataItems[2]));

  S.$gameParty.loseItem(S.$dataItems[2], 10);
  t('直接 loseItem 10 个 -> 正常减少为 89（不影响买卖）',
    S.$gameParty.numItems(S.$dataItems[2]) === 89,
    'n=' + S.$gameParty.numItems(S.$dataItems[2]));
}

// ===========================================================================
console.log('\n=== 3. Infinite Mode = off（只发一次） ===');
{
  const p = Object.assign({}, BASE, { 'Infinite Mode': 'off' });
  const S = buildRuntime(p);
  newGame(S);
  t('开局获得 99 个', S.$gameParty.numItems(S.$dataItems[2]) === 99);
  S.$gameParty.consumeItem(S.$dataItems[2]);
  t('使用 1 个 -> 变成 98（不补）', S.$gameParty.numItems(S.$dataItems[2]) === 98,
    'n=' + S.$gameParty.numItems(S.$dataItems[2]));
}

// ===========================================================================
console.log('\n=== 4. ParallelParty 开场换队伍 ===');
{
  const S = buildRuntime(BASE);
  newGame(S);
  const old = S.$gameParty;
  const Game_Party = old.constructor;
  S.$gameParty = new Game_Party();          // 模拟 $gameParty = currentParty
  S.Scene_Map.prototype.update.call({});
  t('换队伍后补回 380 円', S.$gameParty.gold() === 380, 'gold=' + S.$gameParty.gold());
  t('换队伍后补回 99 个', S.$gameParty.numItems(S.$dataItems[2]) === 99);
  t('旧队伍对象未被污染', old.gold() === 380 && old.numItems(S.$dataItems[2]) === 99);
}

// ===========================================================================
console.log('\n=== 5. 读档不污染 ===');
{
  const S = buildRuntime(BASE);
  S.DataManager.loadGame(1);
  const Game_Party = S.$gameParty.constructor;
  S.$gameParty = new Game_Party();
  S.$gameParty._gold = 137;
  S.$gameParty._items[2] = 3;
  S.Scene_Map.prototype.start.call({});
  S.Scene_Map.prototype.update.call({});
  t('读档后金钱保持 137', S.$gameParty.gold() === 137, 'gold=' + S.$gameParty.gold());
  t('读档后物品保持 3 个', S.$gameParty.numItems(S.$dataItems[2]) === 3);
}

// ===========================================================================
console.log('\n=== 6. 玩家收益不被削减 ===');
{
  const S = buildRuntime(BASE);
  newGame(S);
  S.$gameParty.gainGold(1000);
  S.Scene_Map.prototype.update.call({});
  t('赚到 1380 円不被削回 380', S.$gameParty.gold() === 1380, 'gold=' + S.$gameParty.gold());
}

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
