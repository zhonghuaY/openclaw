# 模型选择底部抽屉(Model Sheet)重新设计

**日期**: 2026-02-28
**状态**: Approved

## 问题

当前 OpenClaw 对话页面的模型选择使用原生 HTML `<select>` 下拉框，存在以下问题：

- 无法展示模型元信息（Provider、状态等）
- Session 管理操作（绑定/解绑/新建/删除）混在 optgroup 里，不直观
- 移动端体验差
- 无搜索过滤能力
- 同一模型多 session 管理不便

## 方案

**方案A（已选定）**：纯 Lit 自定义 Web Component 实现底部上拉抽屉。

选择原因：零外部依赖、与现有 Lit 架构完全一致、包体积最小。

---

## 组件架构

### 新增组件

```
ui/src/ui/components/model-sheet.ts    — 抽屉容器 + 搜索 + 分组列表
ui/src/ui/components/model-card.ts     — 单个模型卡片（折叠/展开 + session 操作）
ui/src/styles/components/model-sheet.css — 所有相关样式
```

### 修改文件

```
ui/src/ui/views/chat.ts               — 替换 <select> 为触发按钮 + <model-sheet>
```

### 组件树

```
chat.ts (现有)
├── <button class="model-sheet-trigger">  ← 替代原 <select>
│   显示：当前模型名 + Provider图标 + ▲箭头
│
└── <model-sheet>                         ← 底部抽屉容器
    ├── backdrop (遮罩层)
    ├── sheet panel
    │   ├── 拖拽手柄条 (装饰)
    │   ├── 搜索框 (sticky)
    │   ├── Auto (默认) 选项 (固定顶部)
    │   └── 分组模型列表
    │       ├── 「已绑定 Active」分组
    │       │   └── <model-card> ...
    │       ├── 「可用 Available」分组
    │       │   ├── Anthropic 子组
    │       │   ├── OpenAI 子组
    │       │   ├── Google 子组
    │       │   └── Other 子组
    │       └── 「不可用 Unavailable」分组
    │           └── <model-card> ...
    └── (底部安全区域)
```

---

## 模型卡片设计

### 折叠状态（默认）

```
┌─────────────────────────────────────────┐
│ 🟣 claude-sonnet-4.6       ● Bound     │
│    Anthropic                            │
└─────────────────────────────────────────┘
```

- 左侧：Provider 彩色圆点
- 中间：模型名（粗体）+ Provider 名（灰色小字）
- 右侧：状态标签（绿=Bound, 灰=Unbound, 红=Unavailable）

### 展开状态（点击卡片后）

```
┌─────────────────────────────────────────┐
│ 🟣 claude-sonnet-4.6       ● Bound     │
│    Anthropic                            │
│ ─────────────────────────────────────── │
│  Session: sk-abc123...                  │
│  Bound to: current chat                │
│                                         │
│  ┌──────┐ ┌────────┐ ┌──────┐ ┌─────┐ │
│  │ 选择  │ │  解绑   │ │ 新建  │ │ 删除 │ │
│  └──────┘ └────────┘ └──────┘ └─────┘ │
└─────────────────────────────────────────┘
```

### 操作按钮

| 按钮          | 回调                          | 何时显示          |
| ------------- | ----------------------------- | ----------------- |
| 选择 (Select) | `onModelChange(model)`        | 始终              |
| 绑定 (Bind)   | `onModelSessionBind(model)`   | status=unbound    |
| 解绑 (Unbind) | `onModelSessionUnbind(model)` | status=bound-self |
| 新建 Session  | `onModelSessionStart(model)`  | 始终              |
| 删除 (Close)  | `onModelSessionClose(model)`  | status≠unstarted  |

按钮根据 `ModelSessionState.status` 动态显示/隐藏。

---

## 交互与动画

### 打开

- 触发：点击触发按钮
- Backdrop: `opacity: 0 → 0.5`, `300ms ease-out`
- Panel: `transform: translateY(100%) → translateY(0)`, `300ms cubic-bezier(0.32, 0.72, 0, 1)`
- 搜索框自动获得焦点

### 关闭

- 触发方式：点击 backdrop / 按 Esc / 选择模型确认后
- 反向动画 `200ms ease-in`
- 关闭后焦点回到触发按钮

### 抽屉高度

- `min-height: 200px`
- `max-height: 70vh`
- 内容区域 `overflow-y: auto`
- 搜索框 `position: sticky; top: 0`

### 焦点管理

- 打开时焦点进入搜索框
- Tab 在抽屉内循环（焦点陷阱）
- 关闭后焦点回到触发按钮

### 桌面端与移动端

- 统一使用底部抽屉，不区分设备

---

## 搜索过滤

- 实时过滤（输入即搜索，无 debounce）
- 搜索范围：模型名称 + Provider 名称
- 大小写不敏感
- Auto 选项不受搜索影响，始终显示
- 空结果显示：「No models match "xxx"」

---

## 数据流

### Props（复用现有 ChatProps，不改变接口）

```typescript
// 输入数据
modelOptions: string[]
connectableModelOptions: string[]
boundModelOptions: string[]
modelSessionStates: ModelSessionState[]
selectedModel: string | null
defaultModel: string | null

// 回调
onModelChange: (model: string | null) => void
onModelSessionStart: (model: string) => void
onModelSessionBind: (model: string) => void
onModelSessionUnbind: (model: string) => void
onModelSessionClose: (model: string) => void
```

### 组件内部状态

```typescript
// model-sheet 自管理
open: boolean;
searchQuery: string;
expandedModel: string | null;
// filteredModels — 根据 searchQuery 实时计算
```

### 分组算法

1. `modelSessionStates` 中 status=bound-self/bound-other → 「已绑定 Active」
2. `connectableModelOptions` 中非 Active 的 → 「可用 Available」
3. 剩余 → 「不可用 Unavailable」
4. 「可用」组内按 Provider 前缀分子组：
   - `claude-*` → Anthropic
   - `gpt-*` → OpenAI
   - `gemini-*` → Google
   - 其余 → Other

---

## 视觉风格

### 主题变量（复用现有）

```css
/* 抽屉面板 */
background: var(--card);
border-top: 1px solid var(--border);
border-radius: 16px 16px 0 0;

/* 遮罩 */
background: rgba(0, 0, 0, 0.5);

/* 搜索框 */
background: var(--input);
border: 1px solid var(--border);

/* 模型卡片 */
background: var(--card);
border: 1px solid var(--border);
border-radius: 8px;
padding: 12px 16px;
margin: 4px 0;
/* hover: background: var(--accent) */
/* 展开态: border-color: var(--ring); box-shadow: var(--focus-ring) */
```

### Provider 颜色

| Provider  | 前缀       | 颜色                      |
| --------- | ---------- | ------------------------- |
| Anthropic | `claude-*` | `#7C3AED` 紫色            |
| OpenAI    | `gpt-*`    | `#10A37F` 绿色            |
| Google    | `gemini-*` | `#4285F4` 蓝色            |
| Other     | —          | `var(--muted-foreground)` |

### 状态标签

| 状态        | 颜色                           |
| ----------- | ------------------------------ |
| Bound       | `#22C55E` 绿色                 |
| Unbound     | `var(--muted-foreground)` 灰色 |
| Unavailable | `#EF4444` 红色                 |

### 操作按钮

- 复用 `.btn` 类，高度 32px，间距 8px
- "选择" → `.btn.primary`
- "删除" → `color: #EF4444`

### 拖拽手柄条

- 宽 40px，高 4px，圆角 2px，居中
- 颜色 `var(--muted-foreground)` opacity 0.4
- 纯装饰，不支持拖拽

### 分组标题

- 字号 12px，`var(--muted-foreground)`
- 大写，letter-spacing 0.05em
- Provider 子组带对应颜色圆点

---

## 后端实现说明

后端 OpenCode 和 Copilot 的具体 API 实现放在 `copilot-api-gateway-new-sessions/` 目录中。

现有后端接口已支持所需功能：

- `models.list` — 获取模型列表
- `sessions.patch` — 模型切换、session 绑定/解绑/新建/关闭
- Gateway 的 `_resolve_model()` — 模型名称解析
- `GET /v1/models` — OpenAI 兼容的模型列表端点

如需扩展（如返回 Provider 信息、context window 等元数据），在 gateway 的模型列表响应中添加字段即可。

---

## 不在范围内

- 拖拽调整抽屉高度
- 模型收藏/置顶
- 模型使用频率排序
- 模型性能对比
