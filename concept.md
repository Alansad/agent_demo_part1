---                                                                                                                                                             
一、Function Calling 是什么

Function Calling = LLM 决定调用你写的函数，并告诉你传什么参数。

它不是 LLM 直接执行你的代码，而是一个"意图识别 + 参数提取"机制：

你说："北京今天天气怎样？"

                      ┌─────────────────────────┐
    你的问题 ─────→  │   LLM（语言理解能力）    │
                      │                         │
    工具描述 ─────→  │  "哦，需要调 get_weather │
    (description)     │   city='北京' "         │
                      └────────────┬────────────┘
                                   │ 返回意图（不执行）
                                   ↓
                      { type: "tool_use",
                        name: "get_weather",
                        input: { city: "北京" } }
                                   │
                      你的代码接收后，自己执行函数
                                   ↓
                      executeTool("get_weather", { city: "北京" })
                                   │
                      结果塞回给 LLM → 生成最终回复

关键点：LLM 只负责"决定调什么、传什么参数"，真正执行是你的代码。这就是为什么叫 Function Calling —— LLM calling your function。

  ---
二、这个项目用到的全部技术和概念

按代码位置一一对应：

agent.ts 第 22 行
├── LLM API 调用
│     通过 HTTP 请求访问大模型服务
│     对应：new Anthropic({ baseURL, apiKey })

agent.ts 第 32 行
├── Function Calling / Tool Use
│     上面已解释，核心机制
│     对应：const tools: Anthropic.Tool[]

agent.ts 第 76 行
├── Tool Executor（工具路由）
│     switch 分发 → 执行具体函数
│     对应：function executeTool()

agent.ts 第 128 行
├── Agentic Loop（智能体循环）
│     while(true) 循环，直到 end_turn 才退出
│     这是 Agent 和普通 LLM 调用的最大区别
│     对应：while (true) { ... }

agent.ts 第 130 行
├── Streaming / 流式输出
│     不等全文生成完再返回，逐 token 输出
│     原理：SSE（Server-Sent Events）
│     前端熟悉：EventSource / fetch ReadableStream
│     对应：client.messages.stream(...)
│            stream.on("text", delta => ...)

agent.ts 第 133 行
├── System Prompt
│     给 LLM 设定角色、规则、能力范围
│     每次请求都会带上，相当于"隐藏的前置指令"
│     对应：system: `你是一个有用的 AI 助手...`

agent.ts 第 154 行
├── 短期记忆（Context Window Memory）
│     conversationHistory 数组 = 对话历史
│     每次请求都带上全部历史，LLM 才能"记住"上文
│     类比：Redux store（全局状态）
│     对应：messages.push({ role, content })

agent.ts 第 157 行
├── stop_reason 状态机
│     "end_turn"  → 正常结束
│     "tool_use"  → 需要执行工具，继续循环
│     类比：前端路由守卫 / 状态机流转
│     对应：if (message.stop_reason === ...)

agent.ts 第 197 行
└── 多轮对话（Multi-turn Conversation）
用户 → Agent → 用户 → Agent ...
通过 conversationHistory 贯穿始终
对应：const conversationHistory: Anthropic.MessageParam[]

  ---
三、这个 Demo 没涉及、但学习计划后面会用到的

┌─────────────┬───────────┬─────────────────────────────────────────┐
│    概念     │ 对应 Week │               一句话解释                │
├─────────────┼───────────┼─────────────────────────────────────────┤
│ 长期记忆    │ Week 4    │ 数据库 / 向量库持久化存储，重启后仍记得 │
├─────────────┼───────────┼─────────────────────────────────────────┤
│ RAG 检索    │ Week 4    │ 先搜索相关文档，再喂给 LLM 回答         │
├─────────────┼───────────┼─────────────────────────────────────────┤
│ ReAct 模式  │ Week 3    │ 让 LLM 先输出"思考过程"再行动           │
├─────────────┼───────────┼─────────────────────────────────────────┤
│ 向量数据库  │ Week 4    │ 把文本变成数字向量，用于语义搜索        │
├─────────────┼───────────┼─────────────────────────────────────────┤
│ 多 Agent    │ Week 9    │ 多个 LLM 实例分工协作                   │
├─────────────┼───────────┼─────────────────────────────────────────┤
│ Prompt 优化 │ 全程      │ description 写法影响工具调用准确率      │
└─────────────┴───────────┴─────────────────────────────────────────┘
