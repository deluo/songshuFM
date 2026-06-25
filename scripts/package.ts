import { createWriteStream, existsSync, readFileSync } from 'fs';
import { join } from 'path';

// 支持的平台类型
type Platform = 'edge' | 'chrome' | 'firefox';

// 获取版本号
function getVersion(): string {
  const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
  return pkg.version;
}

// 打包指定平台
async function packagePlatform(platform: Platform): Promise<void> {
  const version = getVersion();
  const distDir = join(process.cwd(), 'dist', platform);
  const outputDir = join(process.cwd(), 'dist');
  const outputFile = join(outputDir, `songshufm-${platform}-v${version}.zip`);

  // 检查构建目录是否存在
  if (!existsSync(distDir)) {
    console.error(`❌ Build directory not found: ${distDir}`);
    console.error(`Run "npm run build:${platform}" first.`);
    process.exit(1);
  }

  console.log(`\n📦 Packaging ${platform} v${version}...`);

  // 动态导入 archiver
  const { ZipArchive } = await import('archiver');

  // 创建 zip 文件
  const output = createWriteStream(outputFile);
  const archive = new ZipArchive({ zlib: { level: 9 } });

  output.on('close', () => {
    const sizeMB = ((archive as any).pointer() / 1024 / 1024).toFixed(2);
    console.log(`✅ Package created: ${outputFile} (${sizeMB} MB)`);
  });

  archive.on('error', (err: Error) => {
    throw err;
  });

  archive.pipe(output);
  archive.directory(distDir, false);
  await archive.finalize();
}

// 主函数
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const platform = args[0] as Platform;

  if (!platform || !['edge', 'chrome', 'firefox'].includes(platform)) {
    console.error('Usage: tsx scripts/package.ts <platform>');
    console.error('Platforms: edge, chrome, firefox');
    process.exit(1);
  }

  await packagePlatform(platform);
}

main();
