# Agent Demo

资深前端工程师从零学习 Agent 开发的实战项目，基于 TypeScript + Anthropic Claude API 构建。

> 本仓库对应**第一阶段（Week 1-2）**：基础筑基，实现第一个可运行的 Agent。

---

## Agent 是什么

```
LLM API + 工具函数(Tool) + 对话历史(Memory) + 循环执行(Loop) = Agent
```

用前端思维类比：

| Agent 概念 | 前端类比 |
|-----------|---------|
| Tool | 异步 Action（接口请求） |
| Memory | 全局状态（Redux/Zustand） |
| Agentic Loop | 状态机（复杂组件行为逻辑） |
| Planning | 路由/流程控制（路由守卫） |
| Workflow | 业务编排（组件通信、逻辑串联） |

---

## 技术栈

- **语言**：TypeScript
- **运行时**：Node.js
- **AI SDK**：`@anthropic-ai/sdk`
- **模型**：Claude Opus 4.6
- **执行**：`tsx`（无需编译，直接运行 TS）

---

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入你的 API Key：

```env
ANTHROPIC_API_KEY=your_api_key_here

# 可选：自定义 API 地址（兼容第三方服务）
# ANTHROPIC_BASE_URL=https://your-proxy.com

# 可选：指定模型（默认 claude-opus-4-6）
# MODEL=claude-opus-4-6
```

### 3. 启动

```bash
npm start
```

---

## 项目结构

```
agent_demo/
├── src/
│   └── agent.ts              # Week 1 主文件（完整 Agent 实现）
├── plan.md                   # 12 周完整学习计划
├── concept.md                # Function Calling 核心概念梳理
├── questions.md              # 代码相关问题与解答
├── reasoning_planning.md     # Reasoning + Planning 概念解析
├── package.json
└── tsconfig.json
```

---

## Week 1 Demo - Function Calling Agent

`src/agent.ts` 实现了一个具备以下能力的完整 Agent：

| 能力 | 说明 |
|------|------|
| 流式输出 | SSE 实时输出 token，避免超时 |
| Function Calling | 3 个内置工具函数 |
| 短期记忆 | 携带完整对话历史，LLM 能记住上文 |
| 交互式 CLI | readline 命令行对话界面 |
| 错误处理 | 认证失败 / 限流 自动处理 |

### 代码结构（按行号）

| 位置 | 模块 | 说明 |
|------|------|------|
| 第 22 行 | LLM API 初始化 | 读取环境变量，支持自定义 baseURL |
| 第 32 行 | Tool 定义 | 告诉 LLM 有哪些工具可用 |
| 第 76 行 | Tool Executor | switch 分发，执行对应工具函数 |
| 第 128 行 | Agentic Loop | `while(true)` 循环，这是 Agent 与普通 LLM 调用的最大区别 |
| 第 130 行 | 流式输出 | `stream.on("text", delta => ...)` |
| 第 154 行 | 短期记忆 | `messages.push(...)` 维护完整对话历史 |
| 第 157 行 | stop_reason 状态机 | `end_turn` 结束，`tool_use` 继续循环执行工具 |
| 第 197 行 | 多轮对话 | `conversationHistory` 贯穿整个会话 |

### 内置工具

- `get_weather` — 查询城市天气（北京、上海、深圳、广州、杭州、成都）
- `calculate` — 数学计算（支持 `+` `-` `*` `/` `^` 幂运算）
- `get_current_time` — 获取当前北京时间

### 示例对话

```
你: 北京和上海今天天气怎么样，哪个城市更适合出行？
你: 2 的 10 次方是多少？再加上 1024 等于多少？
你: 现在几点？再过 3 小时是几点？
```

### 内置命令

| 命令 | 说明 |
|------|------|
| `clear` | 清除对话记忆，开始新对话 |
| `exit` | 退出程序 |

---

## 核心概念解析

### Function Calling 工作原理

LLM **不直接执行**你的代码，而是一个"意图识别 + 参数提取"机制：

```
你的问题 ──→  LLM（语言理解）──→ { type: "tool_use", name: "get_weather", input: { city: "北京" } }
工具描述 ──→                          │
                                      ↓
                              你的代码接收后，自己执行函数
                                      │
                              结果塞回给 LLM → 生成最终回复
```

**关键点**：LLM 只负责"决定调什么、传什么参数"，真正执行是你的代码。

### Tool Definition 格式（Anthropic 协议）

```json
{
  "name": "get_weather",
  "description": "获取指定城市的当前天气信息",
  "input_schema": {
    "type": "object",
    "properties": {
      "city": { "type": "string", "description": "城市名称" }
    },
    "required": ["city"]
  }
}
```

> `description` 写得好不好直接影响 Agent 准确率——LLM 靠它判断"什么时候该调这个工具"。

### 为什么要追加完整消息历史？

API 是**无状态的（stateless）**，每次请求必须带上全部历史。工具调用是一段多轮对话：

```
Round 1 请求: messages = [{ user: "北京天气？" }]
Round 1 响应: stop_reason = "tool_use"，content 含 tool_use block（id: "t001"）

            ↓ 本地执行工具，得到结果

Round 2 请求: messages = [
  { user: "北京天气？" },
  { assistant: [{ type: "tool_use", id: "t001", ... }] },  ← 必须带，含 id
  { user: [{ type: "tool_result", tool_use_id: "t001", content: "晴天 28°C" }] }
]
```

工具结果为什么是 `user` 角色？因为协议规定消息必须 `user → assistant` 交替，工具结果属于"外部世界反馈"，统一归为 `user`。

### Agentic Loop 状态机

```
发请求
  ├── stop_reason = "end_turn"  → 退出循环
  └── stop_reason = "tool_use" → 执行工具 → 结果追加进 messages → 继续循环
```

当前代码已经是 **ReAct 的骨架**（Reasoning + Acting），只是 Thought 在 LLM 内部不可见。Week 3 会补上显式的思考过程。

### Anthropic vs OpenAI 响应结构对比

| 维度 | Anthropic | OpenAI |
|------|-----------|--------|
| 外层结构 | `response.content[]` 数组 | `response.choices[0].message` |
| 文字内容 | `block.type === "text"` | `message.content`（直接字符串） |
| 工具调用位置 | 与文字混在同一 `content[]` | 独立的 `message.tool_calls[]` |
| 工具参数格式 | `input` 是已解析的对象 | `arguments` 是 JSON 字符串，需 `JSON.parse()` |
| 文字和工具能否共存 | 可以 | 不行（content 变 null） |
| 结束标志 | `stop_reason: "end_turn" / "tool_use"` | `finish_reason: "stop" / "tool_calls"` |

### Reasoning + Planning

| 概念 | 作用 | 前端类比 |
|------|------|---------|
| Reasoning | 让模型想清楚再说（思考链） | 写代码前先画流程图 |
| Planning | 把大任务拆成有序子任务 | 把需求拆成 Issues |
| ReAct | 边思考边行动边修正（循环） | 敏捷开发迭代 |

**ReAct 循环模式**（Week 3 核心）：

```
Thought（思考）：我现在需要做什么？
    ↓
Action（行动）：调用工具 X
    ↓
Observation（观察）：工具返回了什么？
    ↓
Thought（再思考）：下一步该怎么做？
    ↓
...循环直到任务完成...
```

---

## 12 周完整学习计划

### 阶段概览

| 阶段 | 周数 | 目标 |
|------|------|------|
| 基础筑基 | Week 1-2 | 能用 TS 写出最小可用 Agent |
| 核心原理 | Week 3-4 | 懂原理，能自主排查问题、优化逻辑 |
| 工程化 | Week 5-8 | 把 Agent 做成前端产品，发挥核心优势 |
| 多 Agent | Week 9-12 | 设计、开发、部署多 Agent 系统 |

### 每周任务

| 周数 | 核心任务 |
|------|---------|
| **Week 1** ✅ | 环境搭建、Function Calling、第一个 Agent（本仓库） |
| Week 2 | LangChain.js / LlamaIndex.TS 核心用法；记忆 + 工具链（≥2 个工具） |
| Week 3 | ReAct 范式原理 + 手动实现；让 Agent 思考后再行动 |
| Week 4 | 向量数据库基础；RAG 检索 Agent（文档问答） |
| Week 5-6 | 前端页面 + 流式输出；可视化调试面板（思考链 + 工具调用日志） |
| Week 7-8 | 完整项目落地（≥5 个自定义工具）；前后端联调可演示 |
| Week 9-10 | 多 Agent 协作；主从 Agent 分工；任务分发与结果汇总 |
| Week 11-12 | 架构优化、部署上线；个人「Agent 开发手册」 |

### 后续会用到的概念

| 概念 | 对应 Week | 说明 |
|------|-----------|------|
| 长期记忆 | Week 4 | 数据库 / 向量库持久化，重启后仍记得 |
| RAG 检索 | Week 4 | 先搜索相关文档，再喂给 LLM 回答 |
| ReAct 模式 | Week 3 | 让 LLM 先输出思考过程再行动 |
| 向量数据库 | Week 4 | 把文本变成向量，用于语义搜索 |
| 多 Agent | Week 9 | 多个 LLM 实例分工协作 |
| Prompt 优化 | 全程 | description 写法影响工具调用准确率 |

---

## 许可证

MIT
