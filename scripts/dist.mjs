// 双档位打包：node scripts/dist.mjs full | basic
// full = 第一档+第二档完整调色；basic = 仅第一档。
// 通过 LUMEDIT_TIER 让 Vite 把 __APP_TIER__ 编译进渲染层/Worker，再用对应 electron-builder 配置出包。
import { spawnSync } from 'node:child_process';

const tier = process.argv[2] === 'basic' ? 'basic' : 'full';
const builderCfg = tier === 'basic' ? 'electron-builder.basic.yml' : 'electron-builder.yml';
const env = { ...process.env, LUMEDIT_TIER: tier };

function run(cmd, args) {
  console.log(`\n[dist:${tier}] $ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, env });
  if (r.status !== 0) {
    console.error(`[dist:${tier}] command failed with code ${r.status}`);
    process.exit(r.status ?? 1);
  }
}

run('npx', ['vite', 'build']);
run('npx', ['electron-builder', '--config', builderCfg]);
console.log(`\n[dist:${tier}] done (config: ${builderCfg})`);
