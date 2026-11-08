import { expect, it, vi } from 'vitest';
import { getClaudeExecutablePath, resolveClaudeNativePath } from '../electron/main/services/agent/claude-runtime';

it.each([
  ['C:\\App\\resources\\app.asar\\node_modules\\sdk\\claude.exe', 'C:\\App\\resources\\app.asar.unpacked\\node_modules\\sdk\\claude.exe'],
  ['/Applications/App.app/Contents/Resources/app.asar/node_modules/sdk/claude', '/Applications/App.app/Contents/Resources/app.asar.unpacked/node_modules/sdk/claude'],
  ['/dev/node_modules/sdk/claude', '/dev/node_modules/sdk/claude'],
  ['/App/app.asar.unpacked/sdk/claude', '/App/app.asar.unpacked/sdk/claude'],
])('resolves a native executable without leaving virtual ASAR paths: %s', (input, expected) => {
  const exists = vi.fn().mockReturnValue(true);
  expect(resolveClaudeNativePath(input, exists)).toBe(expected);
  expect(exists).toHaveBeenCalledWith(expected);
});

it('rejects missing unpacked binaries instead of falling back to the virtual path', () => {
  expect(() => resolveClaudeNativePath('/App/app.asar/sdk/claude', () => false)).toThrow('运行时文件缺失');
});

it('locates the installed SDK platform runtime in development', () => {
  expect(getClaudeExecutablePath()).toMatch(/claude(?:\.exe)?$/);
});
