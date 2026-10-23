#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ONLINE_BASE = 'https://pickker.shiro-ka.workers.dev';

const at = p => fileURLToPath(new URL('../' + p, import.meta.url));
const read = (dir, name) => readFileSync(at(dir + name), 'utf8');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const asciiJS = s => s.replace(/[^\x00-\x7f]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const asciiCSS = (s, name) => {
  if (/[^\x00-\x7f]/.test(s)) throw new Error(`${name} に ASCII 以外の文字がある (全部入りの XML に埋め込むと Blogger が書き換える)`);
  return s;
};
const indented = (s, indent) => esc(s.replace(/\n+$/, '')).split('\n').map(l => l ? indent + l : '').join('\n');

const MARKER = /^([ \t]*)@@(STYLE|SCRIPT):([\w./-]+)@@[ \t]*$/gm;
const assetsOf = dir => [...read(dir, 'theme.xml').matchAll(MARKER)].map(m => m[3]);

const render = {
  inline: {
    STYLE: (dir, i, name) => `${i}<style>\n${indented(asciiCSS(read(dir, name), name), i + '  ')}\n${i}</style>`,
    SCRIPT: (dir, i, name) => `${i}<script>\n${i}//&lt;![CDATA[\n${indented(asciiJS(read(dir, name)), i)}\n${i}//]]&gt;\n${i}</script>`,
  },
  online: {
    STYLE: (dir, i, name) => `${i}<link href='${ONLINE_BASE}/${name}' rel='stylesheet'/>`,
    SCRIPT: (dir, i, name) => `${i}<script src='${ONLINE_BASE}/${name}'></script>`,
  },
};

const build = (dir, mode) => {
  const xml = read(dir, 'theme.xml').replace(MARKER, (_, indent, kind, name) => render[mode][kind](dir, indent, name));
  if (/@@[A-Z]+:/.test(xml)) throw new Error('展開されなかった @@…@@ がある (1行に単独で書くこと)');
  return xml;
};

const outputs = {
  'pickker.xml': build('src/', 'inline'),
  'suisou/pickker-suisou.xml': build('suisou/', 'inline'),
  'suisou/pickker-suisou-online.xml': build('suisou/', 'online'),
};
if (/suisou/i.test(outputs['pickker.xml'])) throw new Error('pickker.xml に suisou が入っている');

if (process.argv.includes('--check')) {
  let ok = true;
  for (const [file, xml] of Object.entries(outputs)) {
    if (readFileSync(at(file), 'utf8') !== xml) {
      console.error(`✗ ${file} が原本と一致しない。node tools/build.mjs で作り直すこと。`);
      ok = false;
    }
  }
  if (!ok) process.exit(1);
  console.log(`✓ ${Object.keys(outputs).join(' / ')} は原本と一致している`);
} else {
  for (const [file, xml] of Object.entries(outputs)) {
    writeFileSync(at(file), xml);
    console.log(`✓ ${file} を生成 (${xml.split('\n').length} 行)`);
  }
  rmSync(at('suisou/dist'), { recursive: true, force: true });
  mkdirSync(at('suisou/dist'));
  const assets = assetsOf('suisou/');
  for (const name of assets) writeFileSync(at('suisou/dist/' + name), read('suisou/', name));
  console.log(`✓ suisou/dist/ に ${assets.join(' / ')}`);
}

for (const file of Object.keys(outputs)) {
  try {
    execFileSync('xmllint', ['--noout', at(file)], { stdio: 'inherit' });
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    execFileSync('python3', ['-c', 'import sys,xml.dom.minidom; xml.dom.minidom.parse(sys.argv[1])', at(file)], { stdio: 'inherit' });
  }
}
console.log('✓ XML well-formed');
