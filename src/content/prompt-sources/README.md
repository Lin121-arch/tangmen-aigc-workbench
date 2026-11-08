# 提示词教程上游来源

查询日期：2026-11-02。Star 为当天 GitHub API 查询快照，后续会变化。

## DAIR.AI Prompt Engineering Guide

- 仓库：https://github.com/dair-ai/Prompt-Engineering-Guide
- Star：79750
- 固定提交：57673726396dd94acb23bdb1e67f27c78ee85a8e
- 保留原文：pages/introduction/elements.zh.mdx、pages/introduction/tips.zh.mdx。
- 许可：MIT，完整许可保存在 DAIR-LICENSE.md。
- 应用：任务、上下文、输入数据和输出要求；明确表达、从简单任务开始、使用示例和迭代。

## ZeroLu Awesome Nano Banana Pro

- 仓库：https://github.com/ZeroLu/awesome-nanobanana-pro
- Star：10373
- 固定提交：a544d8ed0656953ca65cab27792e8475ade4dfad
- 原文节选：README 的 2.16 Cinematic Keyframe Generator、4.2 Professional Product Photography、8.1 Viral Cover Image。
- 内容许可：README 标注 CC BY 4.0，https://creativecommons.org/licenses/by/4.0/ 。仓库 LICENSE 文件同时标注 MIT，原文一并保存在 NANOBANANA-LICENSE.md；本教程保留更具体的内容署名要求，不以 MIT 文件替代内容署名。
- 原始作者和链接保存在 nanobanana-excerpts.md：关键帧案例 @underwoodxie96；商品摄影与封面案例为上游标注的微信文章来源。
- 改编：将多帧输出简化为单镜头连续性练习；改为原创成年角色、无字学习账号封面及工作台节点步骤。未下载第三方演示图片，未将上游演示当作唐门实际交付。

## 本地教学内容

七节中文教程在 src/shared/prompt-tutorial.ts。方法与案例取舍来源于以上项目；具体角色、练习、工作台操作和测试状态由唐门AI补充。教程中的三份完整图片提示词已有本项目对应实测记录；视频与运营提示词按文中状态区分，不能笼统标记为所有模型均已验证。

教程打开、阅读、切换章节和复制提示词均不调用模型、不提交生成任务。上游原文和许可证通过 Vite 的 raw 导入打包，离线可读；只有用户主动打开外部来源链接才需要联网。
