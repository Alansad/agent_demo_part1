# 问题 1：Tool Definition 格式是谁定的？

是 Anthropic（API 提供方）定的，不是你定的。

你只能决定两件事：
- 有哪些工具（你自己写）
- 工具叫什么名字 / 做什么 / 参数是什么（你自己写）

但这个 JSON 结构本身（name / description / input_schema）是固定协议，必须遵守，就像你调用一个 REST API，请求体格式是对方规定的，你不能随便改字段名。

Anthropic 协议规定的格式          OpenAI 协议（略有不同）
───────────────────────          ─────────────────────
{                                {
name: "xxx",                     type: "function",
description: "xxx",              function: {
input_schema: {                    name: "xxx",
type: "object",                  description: "xxx",
properties: {...},               parameters: {...}   ← 字段名不同
required: [...]                }
}                              }
}

LLM 读的是 description —— 它根据你写的描述来判断"什么时候该调这个工具、传什么参数"。所以 description 写得好不好直接影响 Agent 的准确率，这是你最重要的发挥空间。

  ---
# 问题 2：为什么要这样追加消息历史？

根本原因：API 是无状态的（stateless），它不记得上一次调用说了什么，每次请求必须把完整对话历史全部带上。

整个工具调用过程，本质是一段多轮对话：

你发给 API 的 messages 数组（每轮调用都要带全）：

Round 1 请求：
messages = [
{ role: "user",      content: "北京天气怎么样？" }
]

Round 1 响应（stop_reason = "tool_use"）：
assistant 说：我需要调天气工具
content = [{ type: "tool_use", id: "t001", name: "get_weather", input: { city: "北京" } }]

                      ↓ 你本地执行工具函数，拿到结果 "晴天 28°C"

Round 2 请求（必须把上面所有内容带上）：
messages = [
{ role: "user",      content: "北京天气怎么样？" },
{ role: "assistant", content: [{ type: "tool_use", id: "t001", ... }] },  ← ① 必须带
{ role: "user",      content: [{ type: "tool_result",           ← ② 必须是 user
tool_use_id: "t001",           ← ③ id 必须对应
content: "晴天 28°C" }] }
]

Round 2 响应（stop_reason = "end_turn"）：
assistant 说："北京今天晴天，28°C，适合出行。"

为什么工具结果必须是 user 角色？

因为 API 协议规定消息必须 user → assistant → user → assistant 交替出现。工具调用结果是"外部世界反馈给模型的信息"，在协议里统一归类为 user 消息。

为什么 assistant 的完整 content 必须保存（不能只保存文字）？

因为 tool_use block 里有 id: "t001"，下一轮的 tool_result 要用 tool_use_id: "t001" 来对应。如果你只存了文字部分，API 就找不到这个 id，会直接报错。

  ---
用前端状态管理来类比：

conversationHistory  ≈  Redux store（全局唯一数据源）
每次 API 调用         ≈  把整个 store 序列化后发给服务端
tool_use id 对应      ≈  Promise resolve 时需要知道 requestId

 ---
# 问题 3：大模型返回的消息，结构是什么样的
Anthropic 响应结构

{                                                                                                                                                               
"id": "msg_01XFDUDYJgAACzvnptvVoYEL",                   
"type": "message",                                                                                                                                            
"role": "assistant",                                    
"model": "claude-opus-4-6",
"stop_reason": "end_turn",
"usage": { "input_tokens": 25, "output_tokens": 11 },

    "content": [                         ← 数组，每个元素是一个 Block
      {
        "type": "text",                  ← Block 类型 1：普通文字
        "text": "北京今天晴天，28°C。"
      }
    ]
}

调用工具时，content 里会混入 tool_use Block：

{
"stop_reason": "tool_use",
"content": [
{
"type": "text",                  ← 可以和文字共存
"text": "我来查一下天气。"
},
{
"type": "tool_use",              ← Block 类型 2：工具调用
"id": "toolu_01A09q90qw90lq",
"name": "get_weather",
"input": { "city": "北京" }      ← 已经是解析好的对象
}
]
}

开启思维链时还有第三种 Block：

{
"content": [
{
"type": "thinking",              ← Block 类型 3：思考过程
"thinking": "用户在问天气，我需要调用工具...",
"signature": "xxx"               ← 完整性校验，回传时必须原样带上
},
{
"type": "text",
"text": "北京今天晴天。"
}
]
}

  ---
OpenAI 响应结构

{
"id": "chatcmpl-abc123",
"object": "chat.completion",
"model": "gpt-4o",
"usage": { "prompt_tokens": 9, "completion_tokens": 12 },

    "choices": [                         ← 数组（通常只有一个元素）
      {
        "index": 0,
        "finish_reason": "stop",
        "message": {                     ← 单个 message 对象，不是数组
          "role": "assistant",
          "content": "北京今天晴天，28°C。",   ← 直接是字符串
          "refusal": null
        }
      }
    ]
}

调用工具时，content 变为 null，多了 tool_calls 字段：

{
"choices": [
{
"finish_reason": "tool_calls",
"message": {
"role": "assistant",
"content": null,               ← 文字和工具调用不能共存
"tool_calls": [                ← 独立字段，不在 content 里
{
"id": "call_abc123",
"type": "function",
"function": {
"name": "get_weather",
"arguments": "{\"city\": \"北京\"}"   ← ⚠️ JSON 字符串，不是对象！
}                                         需要 JSON.parse() 才能用
}
]
}
}
]
}

  ---
核心差异对比

┌────────────────────┬────────────────────────────────────┬───────────────────────────────────────────────┐
│        维度        │             Anthropic              │                    OpenAI                     │
├────────────────────┼────────────────────────────────────┼───────────────────────────────────────────────┤
│ 外层结构           │ response.content[] 数组            │ response.choices[0].message                   │
├────────────────────┼────────────────────────────────────┼───────────────────────────────────────────────┤
│ 文字内容           │ block.type === "text" → block.text │ message.content（直接字符串）                 │
├────────────────────┼────────────────────────────────────┼───────────────────────────────────────────────┤
│ 工具调用位置       │ 和文字混在同一个 content[] 里      │ 独立的 message.tool_calls[]                   │
├────────────────────┼────────────────────────────────────┼───────────────────────────────────────────────┤
│ 工具参数格式       │ input 是已解析的对象               │ arguments 是 JSON 字符串，需手动 JSON.parse() │
├────────────────────┼────────────────────────────────────┼───────────────────────────────────────────────┤
│ 文字和工具能否共存 │ ✅ 可以（同一个 content 数组）     │ ❌ 不行（content 变 null）                    │
├────────────────────┼────────────────────────────────────┼───────────────────────────────────────────────┤
│ 结束标志字段       │ stop_reason                        │ finish_reason                                 │
├────────────────────┼────────────────────────────────────┼───────────────────────────────────────────────┤
│ 结束标志值         │ "end_turn" / "tool_use"            │ "stop" / "tool_calls"                         │
├────────────────────┼────────────────────────────────────┼───────────────────────────────────────────────┤
│ 思维链             │ type: "thinking" Block             │ reasoning_content（o1 系列）                  │
└────────────────────┴────────────────────────────────────┴───────────────────────────────────────────────┘

  ---
这就是为什么第三方"兼容 Anthropic 协议"的服务可以直接替换 baseURL —— 只要返回的 JSON 结构和上面的 Anthropic 格式一致，SDK 就能正常解析，代码完全不用改。


