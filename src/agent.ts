/**
 * Week 1 - 第一个 Agent Demo
 *
 * 前端工程师视角的 Agent 核心公式：
 *   LLM API + 工具函数(Tool) + 对话历史(Memory) + 循环执行(Loop) = Agent
 *
 * 这个 Demo 覆盖 Week 1 全部目标：
 *   ✅ LLM API 调用（流式输出 / SSE）
 *   ✅ System Prompt（Agent 角色定义）
 *   ✅ Function Calling（3 个工具函数）
 *   ✅ 短期记忆（对话历史 = 前端全局状态）
 *   ✅ 交互式命令行 UI
 */

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import * as readline from "readline";

// ─────────────────────────────────────────────────────────────
// 1. 初始化客户端（读取环境变量 ANTHROPIC_API_KEY）
// ─────────────────────────────────────────────────────────────
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  // 支持自定义 API 地址（兼容 Anthropic 协议的第三方服务）
  ...(process.env.ANTHROPIC_BASE_URL && { baseURL: process.env.ANTHROPIC_BASE_URL }),
});

// ─────────────────────────────────────────────────────────────
// 2. 工具定义（Tool Definitions）
//    前端视角：就像 TypeScript 接口 + JSDoc，告诉 LLM 有哪些"API"可调用
// ─────────────────────────────────────────────────────────────
const tools: Anthropic.Tool[] = [
  {
    name: "get_weather",
    description: "获取指定城市的当前天气信息",
    input_schema: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "城市名称，如：北京、上海、深圳",
        },
      },
      required: ["city"],
    },
  },
  {
    name: "calculate",
    description: "执行数学计算，支持加减乘除和幂运算（用 ^ 表示幂）",
    input_schema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "数学表达式，如：2 + 3 * 4、2^10",
        },
      },
      required: ["expression"],
    },
  },
  {
    name: "get_current_time",
    description: "获取当前日期和时间（北京时间）",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// ─────────────────────────────────────────────────────────────
// 3. 工具执行函数（Tool Executor）
//    前端视角：类似 Redux thunk action，接收参数 → 执行逻辑 → 返回结果
// ─────────────────────────────────────────────────────────────
function executeTool(name: string, input: Record<string, string>): string {
  switch (name) {
    case "get_weather": {
      // 模拟天气 API（真实项目可接 OpenWeather 等）
      const cityWeather: Record<string, string> = {
        北京: "晴天，28°C，湿度 45%，微风",
        上海: "多云，25°C，湿度 70%，东南风 3 级",
        深圳: "阵雨，30°C，湿度 85%，南风 2 级",
        广州: "晴转多云，32°C，湿度 75%，微风",
        杭州: "小雨，22°C，湿度 80%，东风 2 级",
        成都: "阴天，20°C，湿度 78%，静风",
      };
      const weather = cityWeather[input.city] ?? `${input.city}：晴天，20°C，湿度 60%`;
      return `${input.city}当前天气：${weather}`;
    }

    case "calculate": {
      try {
        // 安全过滤：只保留数字和运算符（防止代码注入）
        const sanitized = input.expression.replace(/[^0-9+\-*/().\s^]/g, "");
        // 将 ^ 转换为 ** （JS 幂运算符）
        const jsExpr = sanitized.replace(/\^/g, "**");
        // eslint-disable-next-line no-new-func
        const result = new Function(`"use strict"; return (${jsExpr})`)();
        return `${input.expression} = ${result}`;
      } catch {
        return `计算失败：无法解析表达式 "${input.expression}"`;
      }
    }

    case "get_current_time": {
      const now = new Date();
      return now.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    }

    default:
      return `未知工具：${name}`;
  }
}

// ─────────────────────────────────────────────────────────────
// 4. Agent 核心循环（Agentic Loop）
//    前端视角：类似状态机 —— 发请求 → 判断状态 → 执行工具 → 再发请求
//
//    循环逻辑：
//      发请求 → stop_reason=end_turn → 结束
//            → stop_reason=tool_use → 执行工具 → 把结果塞回 messages → 再发请求
// ─────────────────────────────────────────────────────────────
async function runAgent(
  messages: Anthropic.MessageParam[],
  onText?: (delta: string) => void,
): Promise<void> {
  while (true) {
    // 流式调用（SSE），避免超时，实时输出 token
    const stream = client.messages.stream({
      model: process.env.MODEL ?? "claude-opus-4-6",
      max_tokens: 2048,
      system: `你是一个有用的 AI 助手，具备以下工具能力：
- 查询城市天气（北京、上海、深圳、广州、杭州、成都）
- 执行数学计算（支持 +、-、*、/、^ 幂运算）
- 获取当前时间

用中文回答，保持简洁友好。需要使用工具时，直接调用，无需提前说明。`,
      tools,
      messages,
    });
    console.log('看看messages-aa', messages)

    // 流式接收文字 delta（前端熟悉的 SSE 消费模式）
    stream.on("text", (delta) => {
      onText?.(delta);
    });

    const message = await stream.finalMessage();

    console.log('看看message', message)

    // 将 assistant 的完整回复追加进历史（包含可能的 tool_use block）
    messages.push({ role: "assistant", content: message.content });

    // 状态判断：是否结束
    if (message.stop_reason === "end_turn") {
      break;
    }

    // 状态判断：需要执行工具
    if (message.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of message.content) {
        if (block.type === "tool_use") {
          console.log(`\n  🔧 调用工具：${block.name}`);
          console.log(`     参数：${JSON.stringify(block.input)}`);

          const result = executeTool(
            block.name,
            block.input as Record<string, string>,
          );
          console.log(`     结果：${result}`);

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      // 把所有工具结果作为 user 消息追加，继续循环
      messages.push({ role: "user", content: toolResults });
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 5. 命令行交互界面
//    短期记忆（conversationHistory）= 前端的全局状态（Redux store）
//    每轮对话都携带完整历史 → LLM 能记住上文
// ─────────────────────────────────────────────────────────────
async function main() {
  // 短期记忆：整个会话的对话历史
  const conversationHistory: Anthropic.MessageParam[] = [];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  console.log("╔════════════════════════════════════════╗");
  console.log("║    Week 1 Agent Demo - Function Calling  ║");
  console.log("╠════════════════════════════════════════╣");
  console.log("║  工具：天气查询 / 数学计算 / 当前时间   ║");
  console.log("║  命令：clear（清记忆）/ exit（退出）    ║");
  console.log("╚════════════════════════════════════════╝");
  console.log("\n💡 试试：");
  console.log('   "北京和上海今天天气怎么样，哪个城市更适合出行？"');
  console.log('   "2 的 10 次方是多少？再加上 1024 等于多少？"');
  console.log('   "现在几点？再过 3 小时是几点？"\n');

  const prompt = () => {
    rl.question("你: ", async (input) => {
      const text = input.trim();

      if (!text) {
        prompt();
        return;
      }

      if (text === "exit") {
        console.log("\n👋 再见！");
        rl.close();
        process.exit(0);
      }

      if (text === "clear") {
        conversationHistory.length = 0;
        console.log("🧹 对话记忆已清除\n");
        prompt();
        return;
      }

      // 将用户消息追加进历史（短期记忆更新）
      conversationHistory.push({ role: "user", content: text });

      process.stdout.write("\nAgent: ");
      try {
        await runAgent(conversationHistory, (delta) => {
          process.stdout.write(delta);
        });
        console.log("\n");
      } catch (err) {
        if (err instanceof Anthropic.AuthenticationError) {
          console.error("\n❌ API Key 无效，请检查 ANTHROPIC_API_KEY 环境变量");
          process.exit(1);
        } else if (err instanceof Anthropic.RateLimitError) {
          console.error("\n⚠️ 请求过于频繁，稍后再试");
          conversationHistory.pop(); // 回滚失败的消息
        } else {
          console.error("\n❌ 错误：", err);
          conversationHistory.pop();
        }
      }

      prompt();
    });
  };

  prompt();
}

main();
