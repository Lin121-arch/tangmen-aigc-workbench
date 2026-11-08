import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

/** Native processes cannot execute Electron's virtual ASAR paths. */
export function resolveClaudeNativePath(binaryPath: string, exists = existsSync): string {
  const executablePath = binaryPath.replace(/\.asar([/\\])/, '.asar.unpacked$1');
  if (!exists(executablePath)) {
    throw new Error(`Claude Code 运行时文件缺失：${executablePath}。请重新安装完整程序，打包时保留 Claude SDK 平台依赖并解包到 app.asar.unpacked。`);
  }
  return executablePath;
}

/** Resolve from the SDK itself so its platform binary always matches its version. */
export function getClaudeExecutablePath(): string {
  const appRequire = createRequire(import.meta.url);
  const sdkRequire = createRequire(appRequire.resolve('@anthropic-ai/claude-agent-sdk'));
  const binary = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const platformPackage = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`;
  let binaryPath: string;
  try {
    binaryPath = sdkRequire.resolve(`${platformPackage}/${binary}`);
  } catch {
    throw new Error(`无法定位 Claude Code 运行时 ${platformPackage}，请安装包含 optionalDependencies 的依赖或重新安装完整程序。`);
  }
  return resolveClaudeNativePath(binaryPath);
}
