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

// <img> タグをぜんぶ取り出して、属性を扱いやすい形にする
const images = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => {
  const attr = (name) => (m[0].match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1];
  const srcset = (attr("srcset") || "")
    .split(",")
    .map((s) => s.trim().split(/\s+/)[0])
    .filter(Boolean);
  return { tag: m[0], src: attr("src"), srcset, width: attr("width"), height: attr("height") };
});

// JPEG のファイルから実際の縦横を読む（追加インストールなしで済ませるための最小実装）
function jpegSize(file) {
  const buf = fs.readFileSync(file);
  let i = 2; // 先頭の SOI マーカーをとばす
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    const isSizeMarker =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSizeMarker) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error(`JPEG の大きさが読めない: ${file}`);
}

test("写真ファイルがすべて実在する（src と srcset の両方）", () => {
  assert.ok(images.length >= 3, "写真が少なすぎる（差しかえで消えた？）");
  for (const img of images) {
    for (const ref of [img.src, ...img.srcset]) {
      assert.ok(ref, `src の無い画像: ${img.tag}`);
      assert.ok(!/^https?:/.test(ref), `写真は同じリポジトリに置く方針: ${ref}`);
      assert.ok(fs.existsSync(path.join(__dirname, "..", ref)), `写真ファイルが無い: ${ref}`);
    }
  }
});

test("写真の width / height がファイルの実寸と一致している（表示がゆがまない）", () => {
  for (const img of images) {
    assert.ok(img.width && img.height, `width / height が無い画像: ${img.src}`);
    const real = jpegSize(path.join(__dirname, "..", img.src));
    assert.strictEqual(Number(img.width), real.w, `width が実寸と違う: ${img.src}`);
    assert.strictEqual(Number(img.height), real.h, `height が実寸と違う: ${img.src}`);
  }
});

test("どの写真にも出典（撮影者とライセンス）が書かれている", () => {
  const figures = [
    ...html.matchAll(/<figure\b[^>]*class="[^"]*\bshot\b[^"]*"[^>]*>([\s\S]*?)<\/figure>/g),
  ];
  assert.strictEqual(figures.length, images.length, "出典を書く枠に入っていない写真がある");
  for (const [, inner] of figures) {
    assert.match(inner, /<figcaption\b/, "説明文（figcaption）の無い写真がある");
    assert.match(inner, /写真：\S/, "撮影者の表示が無い写真がある");
    assert.match(inner, /creativecommons\.org\/licenses\//, "ライセンス表示が無い写真がある");
  }
});

test("写真の「準備中」プレースホルダーが残っていない", () => {
  assert.ok(!/準備中/.test(html), "差しかえ待ちの表示が残っている");
});

test("書きかけのメモ（TODO など）が残っていない", () => {
  assert.ok(!/TODO|FIXME|XXX|lorem ipsum/i.test(html), "書きかけの目印が残っている");
});

test("方針どおり JavaScript を使っていない（HTML と CSS だけで動く）", () => {
  assert.ok(!/<script\b/i.test(html), "<script> タグが入っている（方針は JS なしの静的サイト）");
});
