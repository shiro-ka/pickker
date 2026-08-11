# pickker

![PC_Preview](preview_img/PC_LD.png)

---

Pico CSS をベースとした Blogger テーマ

<br>

## features

- マークダウン利用
- 目次自動生成
- リンクカード生成
- ダークモード対応

<br>

## install / use

[oqlbodlpo.blogspot.com/2026/04/bloggerpickker](https://oqlbodlpo.blogspot.com/2026/04/bloggerpickker.html)

<br>

## develop

`pickker.xml` は **生成物**。編集するのは `src/` の中身。

```
src/theme.xml   Blogger のテンプレート (b: タグ・ウィジェット定義)
src/style.css   スタイル
src/app.js      全ページ共通 (テーマ切替 / Markdown / 目次 / リンクカード)
src/feed.js     一覧ページ (ホーム / ラベル / 検索 / アーカイブ)
src/related.js  記事ページの関連記事
```

```sh
node build.mjs           # src/ から pickker.xml を生成 (+ XML 検査)
node build.mjs --check   # pickker.xml が src と一致するか確認
```

Blogger はテーマを XML としてパースするので `<style>` `<script>` の中身は
`&` `<` `>` をエンティティに直す必要がある。build.mjs がそれをやるため、
`src/` 側は素の CSS / JS のまま書ける。`src/theme.xml` の `@@INCLUDE:foo@@`
がその差し込み位置（入れ子は非対応）。

<br>

## preview

### Light

![PC_Light](preview_img/PC_Light.png)

### Dark

![PC_Dark](preview_img/PC_Dark.png)
