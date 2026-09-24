// ---- plugin:multi_agent_web_code_generate_1 ----
// ============================================================
// 插件 multi_agent_web_code_generate_1 (多Agent网页代码生成) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface MultiAgentWebCodeGenerateOneInput {
  /** 网页开发需求描述，包含功能、设计风格、交互要求等 */
  web_requirement: string;
}

/**
 * capabilityClient.load('multi_agent_web_code_generate_1').callStream<MultiAgentWebCodeGenerateOneOutput>('textGenerate', input)
 * 每个 chunk 就是下面这个扁平对象，字段名与 MultiAgentWebCodeGenerateOneOutput 一致，外面没有 data / choices / message 包装：
 *   {"content":"示例文本","response":"示例文本"}
 * 返回值可能是 AsyncIterable<chunk>，也可能是 { output: AsyncIterable<chunk> }，取流前先归一化。
 * 逐段累加：
 *   for await (const chunk of stream) { result += chunk.content ?? ''; }
 */
export interface MultiAgentWebCodeGenerateOneOutput {
  /** [object Object] */
  content: string;
  /** [object Object] */
  response?: string;
}
// ---- end:multi_agent_web_code_generate_1 ----