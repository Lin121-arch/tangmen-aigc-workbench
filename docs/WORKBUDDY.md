# 给WorkBuddy的接手说明

可以将下面这段交给自己的WorkBuddy：

```text
请协助我运行唐门AIGC工作台，仓库是https://github.com/Lin121-arch/tangmen-aigc-workbench。

先读取README、AGENTS和docs/WINDOWS.md，检查操作系统、系统位数、Node/npm/Git与网络条件。先说明准备使用安装包还是源码；不要假装GitHub的源码压缩包就是安装程序。

如果使用安装包，先查看Release的真实兼容性说明和SHA-256。Windows 10的0xC000007B尚未确认修复，遇到同样报错请收集错误与异常模块，不要无限重复安装，也不要建议关闭系统防护或从DLL下载网站补文件。

如果使用源码，放到新的本地目录，运行npm ci、npm run setup:runtime，再运行npm run dev。保留optionalDependencies，默认student模式；不要自动导入教师或其他软件的配置。遇到依赖或Electron下载失败时保留具体错误，分别检查依赖下载与运行时下载，不要把网络失败当成程序已损坏。

我已有工程时先备份再升级，不要覆盖项目、聊天或模型服务。模型地址与密钥由我自己在设置页填写，不能写进Git、文档、截图或日志。先验证空配置界面能够启动，再配置服务；未经我确认不提交计费图片或视频任务。

完成后给我实际启动结果、使用的版本和仍未解决的问题。如果不能运行，说清楚失败在哪一步，不要只汇报编译通过。
```
