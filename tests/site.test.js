// サイトの「壊れやすいところ」を自動チェックするテスト。
// Node.js 標準機能だけで動く（追加インストール不要）。実行: node --test
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const htmlPath = path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(htmlPath, "utf8");

test("index.html が存在し、タイトルに「分杭峠」が入っている", () => {
  const m = html.match(/<title>([^<]*)<\/title>/);
  assert.ok(m, "<title> タグが見つからない");
  assert.match(m[1], /分杭峠/);
});

test("スマホ対応と基本設定（lang / viewport / description）がある", () => {
  assert.match(html, /<html[^>]*\blang="ja"/, 'html タグに lang="ja" がない');
  assert.match(html, /<meta[^>]*name="viewport"/, "viewport の設定がない（スマホ表示が壊れる）");
  assert.match(html, /<meta[^>]*name="description"/, "description（検索結果に出る説明文）がない");
});

test("ページ内リンク（#〜）の飛び先がすべて存在する", () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const targets = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  assert.ok(targets.length >= 5, "ページ内リンクが少なすぎる（構造が変わった？）");
  for (const t of targets) {
    assert.ok(ids.has(t), `リンク先 #${t} に対応する id が見つからない`);
  }
});

test("外部リンクはすべて https で、別タブで開く設定に rel=noopener が付いている", () => {
  assert.ok(!/href="http:\/\//.test(html), "https でない外部リンクがある");
  for (const m of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
    assert.match(m[0], /rel="[^"]*noopener[^"]*"/, `noopener が無いリンク: ${m[0]}`);
  }
});

test("画像タグにはすべて alt（代替テキスト）がある", () => {
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    assert.match(m[0], /\balt="/, `alt の無い画像: ${m[0]}`);
  }
});

test("書きかけのメモ（TODO など）が残っていない", () => {
  assert.ok(!/TODO|FIXME|XXX|lorem ipsum/i.test(html), "書きかけの目印が残っている");
});
