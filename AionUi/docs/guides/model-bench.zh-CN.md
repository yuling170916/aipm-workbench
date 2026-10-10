# 模型对比台

入口在侧边栏「模型对比台」，路由为 `#/model-bench`。

## 使用

1. 在「模型设置」添加聚合接口或独立接口，配置地址、密钥、模型列表。需要时设置每个模型的协议或 OpenAI Responses 模式。
2. 返回对比台并刷新，选择 2～4 个模型。相同模型的不同接口来源分别显示。
3. 输入统一提示词，可添加一份 UTF-8 TXT、Markdown、CSV 或 JSON 材料（最大 300 KB）。组合输入最大 400 KB。
4. 点击「同时发送」，各窗口独立流式输出。支持全部停止、单个结果重新生成、复制答案。
5. 点击「保存对比」。记录保存到当前用户的后端偏好存储，保留最近最多 5 次，较大记录会减少保留数量。保存的是实际发送的材料与提示词，以及各模型、接口来源、答案、状态和耗时。

重新生成使用该次测试的原始输入，即使输入框已被修改。切换页面会取消未完成的请求；尚未保存的页面结果不会保留。

## 首版边界

- 支持 OpenAI Chat Completions 兼容接口、显式配置的 Responses 接口、Anthropic Messages 和 Gemini 原生文本流式接口。
- 不包含 Bedrock、Vertex AI 和网站登录型模型，也不自动调用工具、联网搜索或处理原生 PDF/Word/图片。
- 各模型使用自身默认采样参数；Anthropic 输出上限为 4096 tokens。耗时包含网络时间，不能单独代表模型推理速度。达到输出限制时保留部分答案并显示失败，避免把截断结果当作完整结果。
- 价格和 token 用量尚未统计，调用由所选接口计费。点击重试也会产生新的调用。
- 每次请求超时为 180 秒，后台最多同时转发 16 个请求。密钥在后台读取，不进入对比页面的模型目录或记录。
- 简体、繁体中文和英文文案已提供，其他界面语言暂用英文回退。

## 开发与发布

本功能同时修改 AionUi 和 AionCore，必须将两者一起构建发布。仅重启当前已安装的旧版应用不会加载源码改动。

专项验证：

```sh
# AionUi
node scripts/generate-i18n-types.js
node scripts/check-i18n.js
node_modules/.bin/tsc --noEmit
node_modules/.bin/vitest run tests/unit/renderer/modelBench

# AionCore
cargo test -p aionui-system benchmark
cargo test -p aionui-app --test agent_provider_health_e2e model_benchmark
```

接口复用现有鉴权路由；外部身份模式还经过原项目 CSRF 中间件。转发错误仅提供固定错误码和状态码，不返回上游错误正文或密钥。生产日志只记录接口标识和拒绝状态，不记录提示词、材料和答案。
