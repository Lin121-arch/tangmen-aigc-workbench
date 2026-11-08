# prompt-kit 来源与改编

- 仓库：https://github.com/ibelick/prompt-kit
- 固定提交：5a9496635cc0e1bf7679fe2a9e35d9b36b99c08a
- 上游作者：Julien Thibeaut（ibelick）；许可：MIT，见同目录 LICENSE.md。
- 直接改编：`components/prompt-kit/prompt-input.tsx` 的 Context、受控输入、自动高度、Enter 提交及 Actions 组合。落点为 `src/components/prompt-kit/prompt-input.tsx`。
- 排版基底：`components/blocks/conversation-prompt-input.tsx` 的单列对话、底部收窄输入区、输入与底部工具栏、右侧发送键。采用其单色深色组件语言，替换为唐门暖金强调色。
- 本地改动：用原生 textarea 和 title 代替上游 shadcn Textarea/Tooltip；保留现有历史滚动实现；补中文输入法防误发、图片/视频模式、已登记模型选择、参考图、画幅与时长、持久化媒体结果。
- 未采用上游演示消息、模拟定时回复、麦克风、联网搜索与评价按钮。界面生成实际经过本项目主进程适配器，不使用上游模拟实现。
- 本声明与许可随 Vite public 静态资源一起打包。
