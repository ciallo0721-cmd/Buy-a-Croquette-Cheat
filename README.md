# 买个可乐饼吧！· 无限可乐饼

> **Buy a Croquette — Infinite Croquette Patch**
> 一键给 Steam 正版《买个可乐饼吧！》装上开局资源 + 无限可乐饼外挂。

[![Platform](https://img.shields.io/badge/platform-Windows-0078D6?style=flat-square)](#)
[![Engine](https://img.shields.io/badge/engine-RPG%20Maker%20MV-2f8d46?style=flat-square)](#)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

---

## 效果

开新档的那一刻，直接拿到：

| 项目 | 数量 |
|---|---|
| 初始资金 | **380 円** |
| 市村可乐饼 | **99 个**（RPG Maker MV 单格上限） |
| 无限模式 | 数量**永不低于 99** |

不修改存档、不注入进程、不改内存。纯粹是游戏脚本层的插件扩展 ——
背包上限、物品日志、成就、Steam 云存档全部照常工作。

实测截图：

| 持有 380 円 | 市村可乐饼 ×99 |
|---|---|
| ![gold](screenshots/01-gold-380.png) | ![croquette](screenshots/02-croquette-99.png) |

---

## 安装

```
1. 解压到任意目录
2. 双击 install.bat
3. 启动游戏，开新档
```

脚本会自动扫 Steam 库并定位游戏目录。装完会打印绿色成功信息。

**手动指定路径**（自动搜索失败时）：

```bat
install.bat -GamePath "I:\SteamLibrary\steamapps\common\Buy a Croquette"
```

> ⚠️ 安装前请先关闭游戏。补丁**只对新档生效**，读老档不会追溯补给。
>
> 💡 启动游戏请运行 `nw.exe`。`Game.exe` 是 RPG Maker 引擎本体，双击它不会启动游戏。

---

## 参数调整

不用改代码，装完后编辑游戏目录下的 `www\js\plugins.js`：

```js
{
  "name": "KC_InfiniteCroquette",
  "status": true,
  "description": "开局资源注入 + 无限可乐饼（380 円 / 99 个）",
  "parameters": {
    "Starting Gold":     "380",      // 开局金钱
    "Croquette Item ID": "2",        // 物品 ID
    "Croquette Amount":  "99",       // 开局数量 / 无限模式保底值
    "Infinite Mode":     "always"    // always | consume | off
  }
}
```

### Infinite Mode

| 值 | 行为 |
|---|---|
| `always` | 任何途径掉数量都立刻补满（默认，真·无限） |
| `consume` | 只在使用后补满；卖店 / 丢弃正常减少 |
| `off` | 关闭无限，只在开局发一次 |

> 提示：`always` 模式下卖可乐饼也不会减少，等于**无限刷钱**。
> 不想让经济系统崩掉就改成 `consume`。

---

## 卸载

```bat
uninstall.bat                  :: 移除插件，保留存档
uninstall.bat -RestoreSave     :: 额外从备份还原存档（会覆盖当前存档！）
```

脚本会自动做语法校验，写入失败会自行从备份回滚。

---

## 文件清单

| 文件 | 说明 |
|---|---|
| `install.bat` / `install.ps1` | 安装入口 / 主脚本 |
| `uninstall.bat` / `uninstall.ps1` | 卸载入口 / 主脚本 |
| `lib.ps1` | 公共函数库（自动探测、plugins.js 读写） |
| `plugin/KC_InfiniteCroquette.js` | 实际注入游戏的插件 |
| `readme.txt` | 详细中文说明 |
| `LICENSE` | MIT |

---

## 技术细节

**1. 注入点：`DataManager.setupNewGame`**
只在新游戏触发。`DataManager.loadGame` 里清除全部标记，读档流程完全不沾。

**2. 本作启用了 `jumpbegin.js`**
标题画面被跳过，启动即自动进地图。因此注入同时挂在 `Scene_Map.start` 兜底，
`Scene_Boot` 与 `Scene_Title` 两条启动链都能命中。

**3. 本作启用了 `ParallelParty.js`，且 `ShareResource = OFF`**
这是最坑的一环。开场剧情会执行 `$gameParty = currentParty;`，
**把整个队伍对象换掉** —— 刚发下去的钱和物品跟着旧对象一起消失，
表现为金钱与物品「瞬间同时归零」，且没有任何 `_gold` 写入记录。

补丁因此监测 `$gameParty` 的对象身份，首次被替换后补齐一次，然后停止监测（零长期开销）。

**4. 只用引擎标准 API**
`gainItem` / `gainGold` / `loseItem`，不直接篡改内部字段，
因此任何依赖这些接口的既有机制（背包上限、日志、成就）都不受影响。

**5. 全程幂等**
低于目标值才补，重复调用绝对安全。

---

## 测试

```bash
node tests/plugin_test.js
```

用最小 RPG Maker MV 运行时桩离线验证插件行为，共 18 项断言：

```
=== 1. 开局注入（Infinite Mode = always） ===
PASS  开局获得 380 円            -> gold=380
PASS  开局获得 99 个可乐饼
PASS  重复进地图不叠加金钱
PASS  重复进地图不叠加物品
--- 无限模式 always：任何途径掉数量都补满 ---
PASS  消耗 1 个 -> 自动补回 99
PASS  一次消耗 50 个 -> 也补回 99
PASS  金钱不受物品逻辑影响

=== 2. Infinite Mode = consume ===
PASS  使用 1 个 -> 补回 99
PASS  直接 loseItem 10 个 -> 正常减少为 89（不影响买卖）

=== 3. Infinite Mode = off ===
PASS  使用 1 个 -> 变成 98（不补）

=== 4. ParallelParty 开场换队伍 ===
PASS  换队伍后补回 380 円
PASS  换队伍后补回 99 个
PASS  旧队伍对象未被污染

=== 5. 读档不污染 ===
PASS  读档后金钱保持 137
PASS  读档后物品保持 3 个

=== 6. 玩家收益不被削减 ===
PASS  赚到 1380 円不被削回 380

结果: 18 通过 / 0 失败
```

安装脚本本身也做了实机验证：`install.bat` → 49 项插件变 50 项，
`uninstall.bat` → 精确还原回原始 49 项，逐字段一致。

---

## 免责声明

仅供个人单机娱乐与学习交流。请勿用于商业用途，也不要传播修改过的游戏本体。
游戏版权归原作者所有。使用本补丁产生的一切后果由使用者自行承担。

MIT License © 2026 ciallo0721-cmd
