---
name: codex-cli-image-generation
description: 当用户明确要求用 Codex、Codex CLI 或 Codex 内置 image_gen 生图、修图、参考图生图时使用。在 AIGC CANVAS 中先创建 image 节点，再通过本机 Codex CLI 无人值守生成 PNG，把产物复制进项目并更新原节点的 sourcePath。普通画布图片工作流不自动切换到本 Skill。
---

# Codex CLI 生图

使用本机 Codex CLI 的 `image_gen` 生成或编辑图片。此流程消耗用户的 Codex 额度；会话模型负责理解要求和调用工具，实际像素由 `image_gen` 生成。用户明确指定此路线时使用；若由其他生产 Skill 调用，沿用其已有的生成授权和验收要求。

## 执行流程

1. 确认提示词、数量、目标画幅、参考图和当前项目目录。保留用户要求的风格、人物、场景与文字原文。参考图生图时把参考文件作为 CLI 的 `-i` 图片输入，并在提示词中要求查看、以其为参考及说明哪些元素必须继承、哪些要改变；排版变化要单独写清楚。
2. 在 AIGC CANVAS 项目中，先调用 `GetCanvasCapabilities` 确认图片字段，再用 `CreateCanvasNodes` 为每张待生成图片创建 `image` 节点，写入标题、实际提示词和目标画幅，暂不设置 `sourcePath`；保存返回的真实 `nodeId`。如果目标节点已经存在，则用 `GetCanvasNode` 核对并更新其提示词，后续仍写回这个节点。参考生图所需的底图节点须已有有效 `sourcePath`；依赖连线可在生成前建立。没有项目画布时跳过本步，直接交付文件。
3. 每批调用前重新定位可用的 `codex.exe`，确认其同目录存在 `codex-code-mode-host.exe`。自动更新会更换版本目录；不要硬编码 `bin/<hash>`，也不要使用 `node_modules/.bin/codex` 垫片。按 [references/cli-runbook.md](references/cli-runbook.md) 的 Windows 命令执行。
4. 每次 `codex exec` 显式传入 `-m IMAGE_CAPABLE_MODEL_ID -c model_reasoning_effort=none`；工作目录设为当前项目目录，使用 `--skip-git-repo-check -s workspace-write --add-dir <Codex Home>`。在提示词中明确调用 `image_gen` 生成图片，并记录本次对应的画布 `nodeId`。若 CLI 会话没有该工具或指定模型不可用，报告阻塞，不静默改用其他模型或图片服务。每次调用写入独立日志；并发时只依据各自日志里的会话 ID 认领产物。
5. 从该会话对应的 `<Codex Home>/generated_images/<会话 ID>/` 找 PNG。实际取得并能打开 PNG 才算成功；进程退出、日志干净或目录前后差异都不能单独证明出图成功。失败时先检查 CLI/host、模型参数与日志，再决定是否重试；保留未生成节点及其提示词，不写入虚假的 `sourcePath`。
6. 检查实际画幅、内容、参考一致性和透明通道。输出尺寸不固定，不能假设必为 16:9；需要统一画幅或拼图时，按目标比例归一化后再组合，并检查裁剪没有丢失重要内容。要求纯色背景时在提示词中明确“完全不透明、禁止 alpha/抠图”，产出后检查实际 alpha；不要把异常透明背景误判为颜色问题。
7. 在 AIGC CANVAS 项目中，把确认合格的 PNG 由调用方复制到项目内（例如 `uploads/images/codex-cli/`），再调用 `UpdateCanvasNodes`，按第 2 步记录的 `nodeId` 把项目相对 `sourcePath` 写回原图片节点；用 `GetCanvasNode` 核对路径与预览。不得把 `<Codex Home>/generated_images/` 的项目外绝对路径直接写入画布，也不要另建一个结果节点取代原节点。必要时再连接下游节点。

## 提示词与结果边界

- 参考图可帮助保持身份或场景一致，但不能保证准确复制；审核实际图片。模型可能沿用参考图姿态或构图，要求新的四联、四宫格等排版时明确写出目标布局。
- 对需要逐字可辨的中文，把原文逐字写进提示词并检查成图；文字仍可能有误。
- 成功产物与日志要一一对应。`ERROR: Reconnecting...` 可能出现于最终成功的调用中；没有 PNG 时不能宣称成功。
- 仅在目标任务确实要求时执行裁剪、拼图或格式转换，保留原始 PNG 便于复核。不要把历史观测的尺寸、耗时、token 数或某个 exe hash 当成固定规格。
