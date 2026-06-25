import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

// 支持的平台类型
type Platform = 'edge' | 'chrome' | 'firefox';

// 合法的平台名（用于参数校验）。平台特定的 manifest 差异目前为空，
// 由 vite.config.ts 中的 crxjs 统一处理；后续若需差异可在 vite 层扩展。
const platformConfigs: Record<Platform, Record<string, unknown>> = {
  edge: {},
  chrome: {},
  firefox: {},
};

// 构建指定平台
function buildPlatform(platform: Platform): void {
  console.log(`\n🔨 Building for ${platform}...`);

  // 输出目录
  const outputDir = join(process.cwd(), 'dist', platform);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // 设置环境变量并执行构建。
  // 注意：vite.config.ts 直接 import './manifest.json'，crxjs 会据此生成
  // 正确的 manifest（含编译后的 service_worker 路径）到 outDir。
  // 切勿在构建后用源 manifest 覆盖输出，否则会冲掉 crxjs 的路径重写。
  process.env.BUILD_PLATFORM = platform;
  execSync('vite build', {
    stdio: 'inherit',
    env: { ...process.env, BUILD_PLATFORM: platform },
  });

  console.log(`✅ ${platform} build complete: ${outputDir}`);
}

// 主函数
function main(): void {
  const args = process.argv.slice(2);
  const platform = args[0] as Platform;

  if (!platform || !platformConfigs[platform]) {
    console.error('Usage: tsx scripts/build.ts <platform>');
    console.error('Platforms: edge, chrome, firefox');
    process.exit(1);
  }

  buildPlatform(platform);
}

main();
