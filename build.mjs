#!/usr/bin/env node
// src/ を結合して配布用の pickker.xml を生成する。
//
// Blogger はテーマを XML としてパースするため、<style> / <script> の中身も
// & < > をエンティティに直す必要がある。その変換をここが持つことで、
// src 側は素の CSS / JS のまま書ける (エディタの補完もリンタも効く)。
//
// 使い方: node build.mjs [--check]
//   --check … 生成せず、pickker.xml が src と一致するかだけ見る

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const at = p => fileURLToPath(new URL(p, import.meta.url));
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const xml = readFileSync(at('src/theme.xml'), 'utf8').replace(
  /^([ \t]*)@@INCLUDE:([\w./-]+)@@[ \t]*$/gm,
  (_, indent, name) => esc(readFileSync(at('src/' + name), 'utf8').replace(/\n+$/, ''))
    .split('\n').map(l => l ? indent + l : '').join('\n')
);

// インクルード先の @@INCLUDE@@ は展開しない。書いても素通りするだけなので検出する。
if (xml.includes('@@INCLUDE:')) throw new Error('展開されなかった @@INCLUDE@@ がある (入れ子は非対応)');

if (process.argv.includes('--check')) {
  if (readFileSync(at('pickker.xml'), 'utf8') !== xml) {
    console.error('✗ pickker.xml が src と一致しない。node build.mjs で作り直すこと。');
    process.exit(1);
  }
  console.log('✓ pickker.xml は src と一致している');
} else {
  writeFileSync(at('pickker.xml'), xml);
  console.log(`✓ pickker.xml を生成 (${xml.split('\n').length} 行)`);
}

// Blogger は不正な XML を問答無用で弾くので、貼り付けてから気づく前にここで落とす。
// xmllint が無い環境では python3 の minidom で同じ検査をする (どちらも無ければ落とす)
try {
  execFileSync('xmllint', ['--noout', at('pickker.xml')], { stdio: 'inherit' });
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
  execFileSync('python3', ['-c', 'import sys,xml.dom.minidom; xml.dom.minidom.parse(sys.argv[1])', at('pickker.xml')], { stdio: 'inherit' });
}
console.log('✓ XML well-formed');
