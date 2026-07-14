# Chronicle

[简体中文](./README_zh_CN.md) | English

Chronicle is a quiet, time-first record panel for SiYuan. It lays out one year as four coordinated scales—year, quarter, month, and week—so that experiences can be placed in time without turning them into tasks, appointments, or database rows.

The name is inspired by the traditional idea of recording life through the seasons. Chronicle is designed for looking back: the timeline remains primary, categories stay optional, and native SiYuan documents are linked only when an entry needs more context.

## Highlights

- One continuous timeline with year, quarter, month, and independently scrollable week columns.
- Balanced default column ratio of `1 : 1 : 3 : 5`, with draggable dividers and remembered custom widths.
- Activities at four time scales. Year and quarter entries use one row each; month and week entries flow compactly.
- Manual drag sorting within a period, plus dragging to another period with the activity time adjusted automatically.
- Optional category, exact date range, note, and one or more linked SiYuan documents.
- Click any year, quarter, month, or week label to create or open its native time document.
- Panel-local shortcuts: `T` goes to today, `N` creates an activity, `S` opens settings, and `←` / `→` changes year. They are disabled while typing or editing a dialog.
- Theme-aware, low-noise interface with no separate category view and no global shortcut registration.

## Notes and notebooks

Chronicle keeps activities separate from documents. An activity can stand on its own or link to existing SiYuan documents.

- Linked documents are tracked by their stable SiYuan block IDs. Moving a document does not break the link.
- Renaming a linked document refreshes the title shown in Chronicle.
- Deleting a linked document removes only that link; the activity remains.
- Time documents are resolved by their canonical timeline path. If one is deleted, its icon disappears and clicking the time label creates it again.
- On first use, Chronicle uses or creates a notebook named `岁时记`.
- Changing the default notebook migrates only time documents and activity notes created and marked by Chronicle. Existing documents linked from elsewhere are never moved.

## Data safety

Activity data is stored as JSON in the SiYuan workspace under the plugin data directory. Writes are serialized, and the previous good snapshot is kept as `chronicle.backup.json`. SiYuan documents remain native documents in the selected notebook and continue to participate in SiYuan sync, search, history, and snapshots.

## Build

```bash
pnpm install
pnpm build          # build dist/ and package.zip
pnpm make-install   # build and install to ~/SiYuan/data/plugins/siyuan-chronicle-plugin
```

The SiYuan marketplace names are **Chronicle** and **岁时记**. The repository and package identifier are `siyuan-chronicle-plugin`.

## License

MIT
