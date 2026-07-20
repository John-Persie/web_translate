# 网页翻译插件

基于自托管大模型的 Chrome/Edge 浏览器网页全页翻译插件。

## 功能

- 使用内网自托管大模型进行网页全文翻译
- 支持自定义 API 地址、Key、模型名称
- 支持二十余种语言互译
- 翻译后可一键恢复原文
- 兼容 OpenAI Chat Completions 接口格式（vLLM、Ollama、Xinference、SGLang 等）

## 安装

1. 打开 Chrome/Edge，地址栏输入 `chrome://extensions/`
2. 开启右上角 **开发者模式**
3. 点击 **加载已解压的扩展程序**，选择本项目文件夹
4. 加载完成，地址栏旁出现扩展图标

## 使用

### 配置 API

1. 点击地址栏旁的扩展图标
2. 填写 API 参数：
   - **API 地址**：你的大模型 Chat Completions 接口地址，例如 `http://192.168.1.100:8000/v1/chat/completions`
   - **API Key**：如不需要可留空
   - **模型名称**：例如 `qwen`、`qwen2.5`
3. 点击 **保存设置**

### 翻译网页

1. 打开任意网页，右下角出现蓝色悬浮按钮
2. 点击按钮，顶部展开翻译工具栏
3. 选择源语言和目标语言
4. 点击 **翻译页面**
5. 翻译完成后如需还原，点击 **恢复原文**

## 项目结构

```
├── manifest.json              # 扩展配置 (Manifest V3)
├── icons/                     # 扩展图标
├── popup/                     # 设置弹窗
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── content/                   # 内容脚本（翻译核心 + 工具栏 UI）
│   ├── content.js
│   └── content.css
└── background/                # 后台服务（API 代理）
    └── background.js
```

## 大模型接口要求

插件发送的请求格式：

```json
POST /v1/chat/completions
{
  "model": "模型名称",
  "messages": [
    {
      "role": "system",
      "content": "You are a professional translator..."
    },
    {
      "role": "user",
      "content": "[\"文本1\", \"文本2\"]"
    }
  ],
  "temperature": 0.2
}
```

插件解析响应时会查找 `choices[0].message.content` 路径，并自动处理 markdown 代码块包裹的情况。

如果你的大模型接口格式不同，修改 `background/background.js` 中的 `extractContent` 函数即可。

## 常见部署框架配置参考

| 框架 | API 地址 |
|------|---------|
| vLLM | `http://IP:端口/v1/chat/completions` |
| Ollama | `http://IP:11434/v1/chat/completions` |
| Xinference | `http://IP:9997/v1/chat/completions` |
| SGLang | `http://IP:30000/v1/chat/completions` |
| LM Studio | `http://localhost:1234/v1/chat/completions` |
