# 唐门实操模板 · 开源来源

获取日期：2026-11-01。以下原始文本与完整 MIT 许可随应用打包，用于来源追溯；不会作为可执行 ComfyUI 工作流注册，也不调用 MoneyPrinterTurbo 后端。未包含上游图片、视频、模型权重或账号信息。

## ComfyUI 官方工作流模板

仓库：https://github.com/Comfy-Org/workflow_templates

固定提交：`c067929d7e9cc0f3fd15be348fa1a1d85da15946`

Copyright (c) 2023-present Comfy Org，MIT；完整许可：[LICENSE.txt](comfy/LICENSE.txt)。

- [角色四视图](https://github.com/Comfy-Org/workflow_templates/blob/c067929d7e9cc0f3fd15be348fa1a1d85da15946/templates/api_google_nano_banana_create_turnaround_sheet.json)：原 JSON 保存在 `comfy/` 同名文件。移植正/侧/背/侧视角、外观一致性、平光和均匀排列提示词；机器人改为原创角色，21:9 改为 16:9，变成原生角色→四视图/表情图节点。
- [多图参考与 Kontext 编辑](https://github.com/Comfy-Org/workflow_templates/blob/c067929d7e9cc0f3fd15be348fa1a1d85da15946/templates/api_bfl_flux_1_kontext_multiple_images_input.json)：移植 MarkdownNote 的分步编辑、保留主体特征、背景替换与风格迁移框架；保留两条英文提示词骨架。未复制 ImageStitch 算子；当前示例每个目标节点只使用一个上游参考，沿用工作台的参考图轨道。
- [首帧图生视频](https://github.com/Comfy-Org/workflow_templates/blob/c067929d7e9cc0f3fd15be348fa1a1d85da15946/templates/api_bytedance_image_to_video.json)：移植 LoadImage→ByteDanceImageToVideoNode→SaveVideo 的首帧/动作/保存模式，适配为原生图片→视频节点，默认 5 秒。不复用原 Seedance 模型 ID，不保证所有自填模型支持首帧。

## MoneyPrinterTurbo

仓库：https://github.com/harry0703/MoneyPrinterTurbo

固定提交：`4318f3a02ea83b4a75efd68e35b8d88a1f3b9d28`

Copyright (c) 2024 Harry，MIT；完整许可：[LICENSE.txt](moneyprinter/LICENSE.txt)。

- [文案候选模板](https://github.com/harry0703/MoneyPrinterTurbo/blob/4318f3a02ea83b4a75efd68e35b8d88a1f3b9d28/docs/loomloom/moneyprinterturbo-script-candidates.template.json)：原 JSON 在 `moneyprinter/` 同名文件。移植 `subject/requirements/candidateIndex` 输入方式与 `script/videoTerms` 输出结构、5–10 个英文素材词约束；改为右侧创作助手可使用的任务，移除原 `defaultModelRef` 的执行依赖。
- [发布文案函数](https://github.com/harry0703/MoneyPrinterTurbo/blob/4318f3a02ea83b4a75efd68e35b8d88a1f3b9d28/app/services/llm.py)：`build-social-metadata-prompt.py` 仅为原 `build_social_metadata_prompt` 函数的原文节选，不是独立程序。移植 `title/caption/hashtags` 结构、简介与标签分开、标题钩子和行动建议；本地新增抖音、视频号情境，未沿用海外平台字数限制或发布接口。

## 本地边界

6 个模板的中文示例、步骤、节点布局及教材/商品情境为唐门适配，不冒充上游原案例或唐门已交付成果。原始文件用于核对来源；用户实际使用的是 `src/shared/creative-templates.ts` 中转换后的原生节点。

图片默认 Luna；视频为待选择模型占位符，不能直接生成。API 账号、密钥、模型 ID 与首帧协议由使用者配置。创建模板不会联网下载素材或提交生成；不包含自动配音、字幕、成片合并和社交平台发布。
