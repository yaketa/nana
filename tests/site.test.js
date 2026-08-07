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
  // 「#_」だけは例外：メニューをとじるための、わざと飛び先のないリンク
  const targets = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]).filter((t) => t !== "_");
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

test("心得のチェックリストが、チェックできる形になっている", () => {
  const items = [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)]
    .map(([, inner]) => inner)
    .filter((inner) => inner.includes("check-txt"));
  assert.ok(items.length >= 8, "チェックリストの項目が少なすぎる（作りが変わった？）");
  for (const inner of items) {
    assert.match(inner, /<input type="checkbox">/, `チェックボックスの無い項目: ${inner.trim()}`);
    assert.match(inner, /<label>[\s\S]*<input/, "label で囲まれていない（タップで反応しない）");
    const txt = inner.match(/<span class="check-txt">([\s\S]*?)<\/span>/);
    assert.ok(txt && txt[1].replace(/<[^>]*>/g, "").trim(), "文言の無い項目がある");
  }
});

test("標高バッジ（星形）：本文の枠の中にあり、インキの縁取りが消えない作りになっている", () => {
  const hero = html.match(/<header class="hero"[\s\S]*?<\/header>/);
  assert.ok(hero, "表紙（hero）が見つからない");
  const openAt = hero[0].indexOf('<div class="wrap hero-copy">');
  assert.ok(openAt >= 0, "本文の枠（wrap hero-copy）が見つからない");
  // div の開きと閉じを数えながら進み、この枠自身の閉じタグの位置を探す
  let depth = 0, closeAt = -1;
  for (const m of hero[0].slice(openAt).matchAll(/<div\b|<\/div>/g)) {
    depth += m[0] === "</div>" ? -1 : 1;
    if (depth === 0) { closeAt = openAt + m.index; break; }
  }
  assert.ok(closeAt > openAt, "本文の枠（wrap hero-copy）が閉じられていない");
  const at = hero[0].indexOf('class="burst"');
  assert.ok(at >= 0, "標高バッジ（burst）が見つからない");
  assert.ok(openAt < at && at < closeAt,
    "バッジが本文の枠（wrap hero-copy）の外にある。外だと画面の右端が基準になり、広い画面で本文から遠く離れる");
  assert.match(html, /\.hero-copy\{[^}]*position:relative/,
    "位置の基準になる .hero-copy の position:relative が消えている");

  // 縁取りが静かに消える事故を防ぐ：clip-path と filter を同じ要素に書くと、
  // Chrome 系では filter が描く縁取り・影が clip-path ごと切り落とされて見えなくなる。
  // だから切り抜き（clip-path）は ::before に、縁取り（drop-shadow の --ink）は本体に分ける
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const burst = css.match(/\.burst\{([\s\S]*?)\}/);
  assert.ok(burst, "バッジのスタイル（.burst）が見つからない");
  assert.match(burst[1], /drop-shadow\([^)]*var\(--ink\)\)/,
    "バッジのインキ縁取り（drop-shadow の --ink）が消えている（縁が無いと切り紙のようで安っぽく見える）");
  assert.ok(!burst[1].includes("clip-path"),
    ".burst 本体に clip-path を書かない（filter と同居させると Chrome 系で縁取りと影が消える。切り抜きは ::before へ）");
  const burstBefore = css.match(/\.burst::before\{([\s\S]*?)\}/);
  assert.ok(burstBefore && burstBefore[1].includes("clip-path"),
    "星の切り抜き（.burst::before の clip-path）が見つからない");
});

test("表紙の題字：赤の版ズレは filter 方式で行う（text-shadow だと iPhone で崩れる）", () => {
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const h1 = css.match(/\.hero h1\{([\s\S]*?)\}/);
  assert.ok(h1, "題字のスタイル（.hero h1）が見つからない");
  assert.ok(!h1[1].includes("--red"),
    "題字の text-shadow に赤が戻っている。ブラウザによっては影が本体と別の大きさで描かれ、" +
      "題字のうしろに巨大な赤い文字のかけらが出る。赤の版ズレは .h1-txt の filter で行う");
  assert.match(css, /\.h1-txt\{filter:drop-shadow\(.*var\(--red\)\)\}/,
    "赤の版ズレ（.h1-txt の drop-shadow）が消えている");
  assert.match(html, /<h1><ruby><span class="h1-txt">分杭峠<\/span><rt>/,
    "題字の文字が .h1-txt で包まれていない（filter をふりがなにまで掛けないための包み）");
});

test("周辺スポットが 2×2 の 4 枚で、どのカードにも写真が入っている", () => {
  const sec = html.match(/<section[^>]*id="around"[\s\S]*?<\/section>/);
  assert.ok(sec, "周辺スポットのセクションが見つからない");
  const inner = sec[0];
  assert.match(inner, /class="cards cards--2"/, "2列そろえの指定（cards--2）が外れている");
  assert.match(html, /\.cards--2\{grid-template-columns:1fr\}/, "cards--2 の CSS が無い");
  assert.match(html, /@media \(min-width:52rem\)\{\.cards--2\{grid-template-columns:1fr 1fr\}\}/,
    "広い画面で 2 列にする CSS が無い");

  const cards = [...inner.matchAll(/<div class="card[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div class="card|<\/div>)/g)];
  assert.strictEqual(cards.length, 4, "カードが 4 枚ではない（2×2 が崩れる）");
  for (const [, body] of cards) {
    assert.match(body, /<figure class="shot card-shot">/, "写真の入っていないカードがある");
    assert.match(body, /<h3>/, "見出しの無いカードがある");
  }
});

// 行き方セクションを取り出して、カードの並びときっぷの帯に切り分ける
function accessParts() {
  const sec = html.match(/<section[^>]*id="access"[\s\S]*?<\/section>/);
  assert.ok(sec, "行き方のセクションが見つからない");
  const inner = sec[0];
  const gridAt = inner.indexOf('<div class="access-grid">');
  const fareAt = inner.indexOf('<div class="fare-block">');
  assert.ok(gridAt >= 0, "行き方の 3 枚カード（access-grid）が見つからない");
  assert.ok(fareAt > gridAt, "きっぷ（fare-block）がカードの外・下に置かれていない");
  return { inner, grid: inner.slice(gridAt, fareAt), fare: inner.slice(fareAt) };
}

test("料金のきっぷが 3 枚あり、カードの外に置かれている", () => {
  const { inner, grid, fare } = accessParts();
  assert.ok(!/class="ticket"/.test(grid), "きっぷがカードの中に残っている（カードが長くなる）");

  const tickets = [...fare.matchAll(/<li class="ticket"[\s\S]*?<\/li>/g)].map(([t]) => t);
  assert.strictEqual(tickets.length, 3, "きっぷが 3 枚ではない");
  for (const t of tickets) {
    assert.match(t, /class="ticket-label"/, `ラベルの無いきっぷがある: ${t}`);
    assert.match(t, /class="ticket-price"/, `金額の無いきっぷがある: ${t}`);
  }
  for (const yen of ["2,000", "1,260", "1,000"]) {
    assert.ok(inner.includes(yen), `料金 ${yen}円 が消えている`);
  }
});

test("行き方の 3 枚カードは分量がそろっている（下に大きな余白が出ない）", () => {
  const { grid } = accessParts();
  const cards = [...grid.matchAll(/<div class="card"[^>]*>([\s\S]*?)<\/div>/g)]
    .map(([, body]) => body.replace(/<[^>]*>/g, "").replace(/\s+/g, ""));
  assert.strictEqual(cards.length, 3, "カードが 3 枚ではない");
  const lens = cards.map((c) => c.length);
  assert.ok(
    Math.max(...lens) / Math.min(...lens) < 1.6,
    `カードの文章量が偏っている（${lens.join(" / ")} 文字）。短いカードの下に空白ができる`
  );
});

test("バス時刻表：caption は表題だけ、時刻は tt-time、「土休日のみ」ラベルは 6 個", () => {
  const cap = html.match(/<caption>([\s\S]*?)<\/caption>/);
  assert.ok(cap, "時刻表の caption が見つからない");
  assert.strictEqual(cap[1], "バス時刻表（2026年・発車時刻）",
    "caption は表題だけにする（＊印や凡例の文を caption に書かない）");
  const times = [...html.matchAll(/<span class="tt-time">\d{1,2}:\d{2}/g)];
  assert.strictEqual(times.length, 14, "時刻の span（tt-time）が 7 行 × 2 列の 14 個ない");
  const days = [...html.matchAll(/<span class="tt-day">土休日のみ<\/span>/g)];
  assert.strictEqual(days.length, 6, "「土休日のみ」ラベルが 6 個ない");
  assert.ok(!/＊/.test(html), "旧形式の ＊印 が残っている");
  assert.match(html, /「土休日のみ」の便は、土曜・休日など決まった日だけの運行です。/,
    "ラベルの意味を説明する注記（表の下の note）が消えている");
});

test("セクションの境目と余白が整っている（境界線・ジャンプの着地・末尾の余白）", () => {
  assert.match(html, /\.section\+\.section\{border-top:2px solid rgba\(51,48,42,\.4\)\}/,
    "となり合うセクションを区切る線が変わっている（淡い色どうしだと境目がぼやける。真っ黒の線は強すぎ、と利用者が選んだ控えめな濃さ）");
  assert.match(html, /\[id\]\{scroll-margin-top:3\.2rem\}/,
    "ページ内ジャンプの着地位置の指定が変わっている（ナビの高さ 約59px より深くすると、ナビの下に前のセクションの色が帯状に見える）");
  assert.match(html, /\.section \.wrap>:last-child\{margin-bottom:0\}/,
    "セクション最後の要素の下マージンを切る指定が消えている（一部のセクションだけ下の余白が間のびする）");
  assert.ok(!/style="[^"]*margin/.test(html),
    "余白の指定が HTML に直書きされている（余白はスタイル表でまとめて管理する）");
});

test("内容の幅が 1 本の基準（--page）にそろっている（本文の横に大きな空白を作らない）", () => {
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.match(css, /--page:48rem/, "基準幅 --page の定義が消えている");
  assert.match(css, /\.wrap\{max-width:var\(--page\)/, ".wrap が基準幅 --page を使っていない");
  assert.match(css, /\.nav-inner\{[\s\S]{0,200}?max-width:var\(--page\)/,
    "ナビの内枠（nav-inner）が基準幅 --page を使っていない");
  // 部品にバラバラの max-width を足すと、基準幅との差のぶん右横に空白の帯ができて目立つ。
  // 例外は表紙の紹介パネル（hero-lead）だけ（表紙の演出として意図的に狭くしている）
  const rules = css.replace(/@media[^{]*/g, ""); // @media (max-width:…) の条件部分を除いてから調べる
  const extra = [...rules.matchAll(/([^{}]+)\{[^{}]*?max-width:(?!var\(--page\))/g)]
    .map((m) => m[1].trim());
  assert.deepStrictEqual(extra, [".hero-lead"],
    `基準幅（--page）以外の max-width がある: ${extra.join(" / ") || "（検出失敗）"}`);
});

test("セクション見出しがスマホの幅で行儀よく収まる（帯の右側に大きな空白を作らない）", () => {
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  // 幅 375px の iPhone で 14 字の見出しがちょうど 1 行に入る組み合わせ。
  // 文字サイズの下限・字間・帯の中の余白はワンセットで、どれか 1 つを緩めると
  // 見出しが 2 行に折れ、帯の右側に大きなオレンジの空白が戻ってくる
  assert.match(css, /\.sec-head h2\{font-size:clamp\(1\.1rem,4\.6vw,2rem\)/,
    "見出しの文字サイズの下限が変わっている（上げるとスマホで 2 行に折れる）");
  const narrow = css.match(/@media \(max-width:25\.98rem\)\{([\s\S]*?)\n\}/);
  assert.ok(narrow, "スマホ幅で見出しまわりをつめる @media (max-width:25.98rem) が消えている");
  for (const rule of [".sec-no{min-width:3rem}", ".sec-head-body{padding-inline:.8rem}", ".sec-head h2{letter-spacing:0}"]) {
    assert.ok(narrow[1].includes(rule), `スマホ幅のつめの指定が消えている: ${rule}`);
  }

  // それでも入らない長い見出しは 2 行になる。そのとき「〜って、ど / んなところ？」の
  // ような変な位置で切れないよう、語句のまとまりを <span> で書いておく決まり
  assert.match(css, /\.sec-head h2 span\{display:inline-block\}/,
    "span を語句のまとまりとして折り返す CSS が消えている");
  const heads = [...html.matchAll(/<header class="sec-head[^"]*">[\s\S]*?<h2>([\s\S]*?)<\/h2>/g)]
    .map((m) => m[1]);
  assert.ok(heads.length >= 7, "セクション見出しが見つからない（構造が変わった？）");
  for (const inner of heads) {
    const plain = inner.replace(/<[^>]*>/g, "");
    if ([...plain].length >= 13) {
      assert.ok(inner.includes("</span><span>"),
        `13 字以上の見出しには語句の切れ目の <span> を入れる（例: <span>分杭峠って、</span><span>どんなところ？</span>）: ${plain}`);
    }
    assert.ok(!/>\s+</.test(inner),
      `見出しの span のあいだに空白や改行を入れない（すき間と変な折り返しになる）: ${plain}`);
  }
});

test("方針どおり JavaScript を使っていない（HTML と CSS だけで動く）", () => {
  assert.ok(!/<script\b/i.test(html), "<script> タグが入っている（方針は JS なしの静的サイト）");
});

test("スマホ用メニュー：ボタン・パネル・とじる仕掛けがそろっている", () => {
  // ボタンはパネル（#menu）を指す
  assert.match(html, /<a class="menu-btn" href="#menu">メニュー<\/a>/, "「メニュー」ボタンが無い");

  // パネルの中に 6 つの章リンクが全部ある
  const panel = html.match(/<div class="nav-links" id="menu">([\s\S]*?)<\/div>/);
  assert.ok(panel, "パネル（nav-links, id=menu）が見つからない");
  for (const t of ["#about", "#zeroba", "#visit", "#access", "#around", "#faq"]) {
    assert.ok(panel[1].includes(`href="${t}"`), `パネルに ${t} へのリンクが無い`);
  }

  // とじる手段は 2 つ：パネル内の「とじる」行と、外側の薄暗い部分（scrim）
  assert.match(panel[1], /<a class="menu-close" href="#_">とじる<\/a>/, "「とじる」リンクが無い");
  assert.match(html, /<a class="menu-scrim" href="#_"[^>]*aria-label="メニューをとじる"/,
    "外側タップでとじる仕掛け（menu-scrim）が無い");

  // JS なしで開閉する要：CSS の :target と、飛び先の無い「#_」
  assert.match(html, /#menu:target\{/, "タップで開くための CSS（#menu:target）が消えている");
  assert.match(html, /#menu:target\s*~\s*\.menu-scrim\{/, "開いたとき後ろを薄暗くする CSS が消えている");
  assert.ok(!/\bid="_"/.test(html),
    'id="_" を作ってはいけない（「#_」はどこにも飛ばないからこそ、画面を動かさずにとじられる）');
});
