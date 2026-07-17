# 我给 Codex 做了一套可安装主题系统：从参考图到一键分享的完整过程

前几天我看到一张很有游戏大厅感的 Codex 概念图：深色背景、暗金边框、东方神话角色、任务卡片，看上去像把开发工具做成了一个可以持续升级的“修炼系统”。

我的第一反应不是简单换一张壁纸，而是想验证一件事：**能不能把这种视觉方向做成真正可安装、可切换、可恢复、还能分享给别人的 Codex 主题？**

最后我做成了 `Codex Theme Studio`。它不是某一套主题的硬编码，而是一套 Windows 版 Codex 主题工作流：只要更换一个主题文件夹里的配置和图片，就能生成新的桌面快捷方式，并通过这个快捷方式启动对应主题。

项目地址：<https://github.com/AJbeckliy/codex-theme-studio>

> 适用环境：Windows 10/11、Microsoft Store 版 Codex、PowerShell 5.1+、Node.js 22+。

## 一、这套方案到底做了什么

先说边界。Codex Theme Studio 能改变的是 Codex 的视觉表现，包括：

- 首页主视觉背景；
- 品牌标题、副标题和引导文案；
- 一到四个首页操作卡片；
- 主色、辅助色、边框、输入框和发送按钮；
- 左右角落装饰；
- 每套主题独立的桌面图标和快捷方式。

它不会把 Codex 的真实功能结构彻底改造成游戏大厅。左侧任务列表、聊天区、项目选择器这些核心功能仍然保留。这样做的好处是主题只负责视觉，不去破坏 Codex 原本的工作流程。

整个系统被拆成两层：

1. **共享主题引擎**：负责校验、安装、启动、注入、截图验证和恢复。
2. **独立主题包**：负责图片、颜色、文案、操作卡片和可选的个性化 CSS。

以后再做新主题，不需要复制一套 JavaScript，只需要增加一个主题文件夹。

## 二、一个主题包包含什么

每套主题都是一个自包含目录：

```text
my-theme/
├─ theme.json
├─ theme.css（可选）
├─ hero.png
├─ corner-left.png
├─ corner-right.png
├─ icon.png
└─ icon.ico
```

几个文件各自负责的内容：

- `theme.json`：主题名称、版本、授权模式、文案、颜色、布局和卡片提示词；
- `theme.css`：可选，只覆盖当前主题的聊天背景、角饰位置、透明度等个性化视觉；
- `hero.png`：首页横向主视觉；
- `corner-left.png`、`corner-right.png`：左右透明角饰；
- `icon.png`：主题原始方形图标；
- `icon.ico`：Windows 桌面快捷方式图标，可由安装器自动生成。

这里最关键的设计是：**图片里尽量不放文字，文字统一写进 `theme.json`。**

这样以后修改标题、翻译语言、调整按钮文案时，不需要重新生成整张图片。

## 三、主题是怎么开发出来的

### 1. 先拆视觉，而不是直接照着参考图复刻

拿到参考图后，我先把它拆成几个可复用的视觉元素：

- 深色或浅色的基础背景；
- 一种明确的强调色；
- 位于画面右侧的主角色或主体；
- 左侧留出文案安全区；
- 统一的边框、角纹和材质；
- 能在小尺寸下识别的图标。

例如东方暗金主题，可以提取“黑曜石、暗金、青铜纹样、东方神话人物”这些方向，但不必复制参考图里的游戏 Logo、角色造型和界面数据。

这一步也决定授权模式。项目目前支持：

- `original`：原创，可公开分享；
- `licensed`：已获得明确授权；
- `personal-ip`：自己的品牌或角色；
- `private-reference`：根据第三方参考制作的私人原型，不能公开传播。

我公开到 GitHub 的示例是原创的 `Argentina Champions`。包含可识别人物或第三方作品参考的主题都通过 `.gitignore` 留在本地，没有上传。

### 2. 生成四类视觉素材

主视觉图使用宽幅构图，主体集中在右侧，左侧保持安静，避免影响标题和按钮。

角饰需要透明背景。实际制作时，先让图像模型生成纯色绿幕或品红背景，再在本地去掉色键并检查边缘。直接用白底假装透明，放进深色界面后会出现非常明显的白边。

图标则正好相反：不要追求细节，应该使用一个轮廓清楚、居中、缩小到 16×16 像素仍能识别的符号。

### 3. 用 `theme.json` 控制主题

主题配置里最常改的是三部分：

```json
{
  "id": "my-theme",
  "displayName": "My Theme",
  "version": "1.0.0",
  "palette": {
    "ink": "#17385F",
    "primary": "#F7D93D",
    "accent": "#D4AF37",
    "background": "#FFF9E8",
    "surface": "#FFFDF7",
    "line": "#CAB57A"
  },
  "layout": {
    "heroPosition": "right center",
    "heroHeight": 500,
    "heroSize": "cover"
  }
}
```

`palette` 控制整个主题的颜色关系；`layout` 决定主视觉的位置和高度；`homeActions` 则定义首页操作卡片，以及点击卡片后发送给 Codex 的提示词。

普通配色只改配置；主题独有的聊天背景和装饰效果写进本主题的 `theme.css`。只有当所有主题都需要一种新能力或 Codex 的 DOM 发生变化时，才修改共享引擎。

### 4. 通过 CDP 把主题应用到 Codex

Windows Store 版 Codex 不是一个可以随便替换源码的普通网页，所以这里没有直接修改安装目录。

主题启动脚本会用远程调试端口启动 Codex，然后通过 CDP 连接正在运行的界面，把共享 CSS、渲染逻辑和当前主题数据注入进去。默认端口是 `9335`。

安装器会让主题快捷方式使用独立的 Theme Studio profile：

```text
%LOCALAPPDATA%\CodexThemeStudio\profile
```

主题不会修改全局 `~/.codex/config.toml`，正常启动的 Codex 窗口仍保持默认主题。恢复时只需移除独立 profile 中的实时注入。

### 5. 生成带主题图标的桌面快捷方式

如果只把启动目标指向 PowerShell，桌面上看到的会是普通 PowerShell 图标，体验很割裂。

因此安装器会把 `icon.png` 转成包含多个尺寸的 `.ico`，再创建两个快捷方式：

```text
桌面\Codex - 主题名称.lnk
桌面\Codex Theme Studio - Restore.lnk
```

开始菜单中也会生成主题启动入口。以后必须通过主题快捷方式打开 Codex，才能建立调试连接并应用主题。

### 6. 增加校验、截图和恢复流程

主题安装前会先验证：

- `theme.json` 是否是合法 JSON；
- ID、版本、颜色值是否符合格式；
- 四张必需图片是否存在；
- 授权模式是否已确认；
- 图片路径是否越过主题目录。

安装后再检查首页、聊天页、输入框、卡片区域和桌面图标。最后必须测试恢复功能，确认主题不仅装得上，也退得掉。

## 四、开发过程中遇到的问题

### 问题 1：Codex 已经打开，但主题没有生效

最常见的原因是 Codex 之前通过普通入口启动，没有开启远程调试端口。

解决方法：保存当前工作，完全关闭 Codex，然后从桌面的 `Codex - 主题名称` 快捷方式重新启动。不要直接双击 WindowsApps 里的程序文件。

### 问题 2：大背景很好看，但卡片跑出了背景区域

沉浸式主视觉高度不够时，操作卡片会越过图片，输入框也可能顶上来。

解决方法：把 `heroHeight` 调到 480～500 左右，并实际检查卡片底部和输入框位置。窗口宽度小于 900 像素时自动切换紧凑布局，避免横向溢出。

### 问题 3：透明角饰出现白边或绿边

原因通常是素材并不是真透明，或者绿幕去除后没有做柔边和去色溢。

解决方法：重新使用纯色色键背景生成，去除背景后检查 Alpha 通道；必要时收缩一像素边缘并做轻微去色溢。

### 问题 4：桌面快捷方式显示成 PowerShell 图标

原因是快捷方式没有正确绑定 `.ico`，或者更新 `icon.png` 后没有重新安装。

解决方法：确认主题目录中存在 `icon.png`，重新运行安装器。安装器会重新生成 `.ico` 并覆盖快捷方式配置。

### 问题 5：中文 `.bat` 在部分 Windows 上乱码甚至无法执行

批处理对 UTF-8 中文的兼容并不稳定，尤其是中文提示位于括号代码块中时，可能被 `cmd.exe` 错误解析成命令。

最终方案是保留中文文件名 `安装主题.bat`，脚本内部使用纯英文提示。这样用户仍然知道该双击哪个文件，同时避免编码导致安装失败。

### 问题 6：公开分享时混入了不能发布的主题

本地做主题时可以使用私人参考，但公开仓库不能默认获得第三方角色、人物肖像或品牌素材的传播权。

解决方法：每套主题都必须在 `theme.json` 中写清 `rights.mode` 和说明；发布前再用 `.gitignore` 排除 `private-reference` 主题。GitHub 公开版只保留确认可分享的原创示例。

### 问题 7：Codex 更新后主题突然失效

主题依赖当前界面结构。如果 Codex 更新改变了 DOM，旧选择器可能找不到目标区域。

解决方法：如果是 DOM 兼容问题，只修共享的 `renderer-inject.js` 或 `base-theme.css`；如果只是某个主题的视觉差异，则修改该主题自己的 `theme.css`。

## 五、如何使用这个 Skill 制作新主题

### 第一步：安装 Skill

把项目中的：

```text
skills\codex-theme-studio
```

复制到：

```text
%USERPROFILE%\.codex\skills\codex-theme-studio
```

然后重启 Codex，让 Skill 列表刷新。

### 第二步：把参考图交给 Codex

可以直接使用类似下面的需求：

```text
请使用 codex-theme-studio，根据这张参考图制作一套 Windows Codex 主题。
保留 Codex 原有功能布局，提取配色、材质、主视觉和装饰语言。
使用原创角色，不复制参考图中的 Logo 和品牌元素。
完成主题包、安装、截图验证和恢复测试。
```

Skill 会按固定流程处理：确认视觉方向和授权模式、建立主题目录、生成四类素材、配置 `theme.json`、校验、安装、启动、截图检查和恢复测试。

### 第三步：手动校验和安装

如果需要自己执行，PowerShell 命令如下：

```powershell
$skill = "$env:USERPROFILE\.codex\skills\codex-theme-studio"
$theme = "C:\path\to\codex-theme-studio\examples\my-theme"

node "$skill\scripts\validate-theme.mjs" --theme $theme
powershell -ExecutionPolicy Bypass -File "$skill\scripts\install-theme.ps1" -ThemePath $theme
```

安装后直接双击生成的主题快捷方式。

截图验证：

```powershell
powershell -ExecutionPolicy Bypass -File "$skill\scripts\verify-theme.ps1" `
  -ThemePath $theme `
  -Screenshot "$PWD\theme-qa.png"
```

恢复实时主题：

```powershell
powershell -ExecutionPolicy Bypass -File "$skill\scripts\restore-theme.ps1"
```

如果使用过不带 profile 隔离的旧版本，可额外清理旧版留下的全局配色：

```powershell
powershell -ExecutionPolicy Bypass -File "$skill\scripts\restore-theme.ps1" -RestoreBaseTheme
```

## 六、收到主题压缩包后，怎么解压和使用

这是给普通使用者看的最短流程。

> 普通使用者不需要把 Skill 复制到 `.codex\skills`。压缩包里的 `安装主题.bat` 会直接调用随包附带的主题引擎。只有想让 Codex 自动创作、修改和验证新主题的人，才需要安装 Skill。

### 1. 准备环境

先确认电脑上已经有：

- Windows 10 或 Windows 11；
- Microsoft Store 版 Codex；
- PowerShell 5.1 或更高版本；
- Node.js 22 或更高版本。

### 2. 解压到固定目录

推荐解压到：

```text
C:\Users\你的用户名\Documents\CodexThemeStudio\
```

也可以放在 D 盘或其他位置，但不要放在微信临时目录、浏览器缓存目录或会自动清理的下载目录。

**安装后不要移动整个文件夹。** 桌面快捷方式记录的是绝对路径，移动后会找不到启动脚本和主题文件。

正确的解压结构应该类似：

```text
CodexThemeStudio\
├─ examples\
│  └─ argentina-champions\
│     ├─ theme.json
│     ├─ theme.css（可选）
│     ├─ hero.png
│     ├─ corner-left.png
│     ├─ corner-right.png
│     ├─ icon.png
│     └─ icon.ico
├─ skills\
│  └─ codex-theme-studio\
├─ README.md
└─ 安装主题.bat
```

### 3. 双击安装

双击：

```text
安装主题.bat
```

窗口会列出可用主题，例如：

```text
Available themes:
  argentina-champions
```

输入主题文件夹名并回车。安装完成后，桌面会出现：

```text
Codex - Argentina Champions
Codex Theme Studio - Restore
```

### 4. 从主题快捷方式启动

先关闭普通 Codex，再双击 `Codex - Argentina Champions`。以后想使用主题，也要从这个快捷方式进入。

不想使用时，双击 `Codex Theme Studio - Restore` 移除当前实时主题。

## 七、常见问题排查

### 双击 `.bat` 后提示找不到 Node.js

安装 Node.js 22 或更高版本。安装完成后关闭原来的命令窗口，重新双击 `安装主题.bat`。

可以在 PowerShell 中检查：

```powershell
node --version
```

### Windows 提示脚本被阻止

如果 ZIP 是从浏览器下载的，先右键 ZIP 文件，打开“属性”，勾选“解除锁定”，再重新解压。

也可以在解压目录打开 PowerShell，执行：

```powershell
Get-ChildItem -Recurse -File | Unblock-File
```

### 安装窗口里没有显示我的主题

确认主题文件夹位于 `examples` 的下一层，并且里面直接存在 `theme.json`：

```text
examples\my-theme\theme.json
```

不要多套一层同名目录。

### 桌面有快捷方式，但打开后还是普通 Codex

先完全关闭所有 Codex 窗口，再从主题快捷方式启动。如果仍然失败，检查日志：

```text
%LOCALAPPDATA%\CodexThemeStudio\injector-error.log
```

### 提示端口被占用

默认端口为 `9335`。可以换一个端口重新安装：

```powershell
$skill = "$env:USERPROFILE\.codex\skills\codex-theme-studio"
$theme = "C:\path\to\my-theme"

powershell -ExecutionPolicy Bypass -File "$skill\scripts\install-theme.ps1" `
  -ThemePath $theme `
  -Port 9444
```

新生成的快捷方式会使用 `9444`。

### 移动文件夹后快捷方式失效

把文件夹移回原位置，或者在新位置重新运行 `安装主题.bat`。不需要修改快捷方式参数。

### 主题文字看不清、按钮颜色不协调

调整 `theme.json` 中的 `ink`、`background`、`surface`、`line`、`primary` 和 `accent`，然后重新安装并验证首页与聊天页。不要只检查首页截图。

### 旧版本曾经修改过默认 Codex 颜色

运行：

```powershell
powershell -ExecutionPolicy Bypass -File `
  "$env:USERPROFILE\.codex\skills\codex-theme-studio\scripts\restore-theme.ps1" `
  -RestoreBaseTheme
```

## 八、最后说一下这套系统最有价值的地方

一套主题本身很容易变成一次性作品，真正有价值的是把制作过程变成可以重复执行的系统。

现在新增主题时，我只需要准备视觉方向、四张素材、一个 `theme.json`，需要特殊聊天背景时再增加一个 `theme.css`。安装、启动、快捷方式、图标、验证和恢复都复用同一套引擎。

这意味着它不只能做东方神话、足球冠军或二次元主题，还可以继续扩展成品牌主题、节日主题、工作模式主题，甚至给不同项目配置不同的操作卡片和提示词。

如果你只想体验，下载 ZIP、固定位置解压、双击 `安装主题.bat` 就可以；如果你想自己创作，就把 Skill 安装进 Codex，然后给它一张参考图和明确的授权边界，让它完成从素材到验证的整个流程。

项目地址：<https://github.com/AJbeckliy/codex-theme-studio>

---

## 配图建议

发布到星球时，建议按这个顺序插图：

1. 成品主题首页全屏图；
2. 原始参考图与最终主题的对比；
3. 单个主题文件夹结构截图；
4. `theme.json` 配色和卡片配置截图；
5. 桌面的主题快捷方式图标；
6. 双击 `安装主题.bat` 后的主题选择窗口；
7. 恢复原主题前后的对比图。
