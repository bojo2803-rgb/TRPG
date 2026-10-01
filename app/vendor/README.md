# 外部のライブラリ（そのまま同梱）

| ファイル | 元 | ライセンス | 変更点 |
|---|---|---|---|
| `ya-wareki.js` | npm `ya-wareki` 0.2.0 の `dist/index.js`（作者 Tatsuki Sugiura。旧暦の対照表は manakai/data-locale の「日本暦日原典」第4版準拠の表） | BSD 2-Clause（`LICENSE-ya-wareki.txt`） | `import` の行き先を `./ya-kansuji.js` に。元号の表 `ERA_TUPLES`・`ERA_NORTH_TUPLES` と、元号のない期間の旧暦を出す `findDateParts` を `export` に追加（南朝・北朝の併記、大化より前の旧暦のため） |
| `ya-kansuji.js` | npm `ya-kansuji` 1.1.0 の `dist/index.js` | `LICENSE-ya-kansuji.txt` | なし |

ヒジュラ暦のウンム・アル＝クラー暦の月の始まりの表は、PyPI `hijri-converter` 2.3.2（MIT、Mohammed Alshehri）の `ummalqura.py` から `app/js/cal/hijri-uaq.js` に書き写した。
