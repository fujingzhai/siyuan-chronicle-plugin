# Chronicle

[简体中文](./README_zh_CN.md) | English

Chronicle is a SiYuan plugin for organizing activities by year, quarter, month, and week.

An activity may belong to an entire year, a quarter, a month, or a week while also recording the exact dates on which it occurred. For example, a trip can belong to Q3 2026 and carry an exact date range of July 12–18. Chronicle brings activities at different time scales into one annual panel for recording, ordering, and review, with native SiYuan notes available for anything that needs more detail.

## Features

- View year, quarter, month, and week together; browse all weeks in a scrollable sequence.
- Move continuously between years with the arrow controls or keys, and press `T` to locate the current year, month, and week.
- Store a title, category, time period, exact dates, note, and linked documents for each activity.
- Display year and quarter activities one per row while keeping month and week activities compact. Column widths are draggable and remembered.
- Reorder activities within a period or drag them into another period; their period and exact dates are adjusted accordingly.
- Click any year, quarter, month, or week label to create or open its hierarchical time note.
- Search and link multiple existing documents to an activity, or create and link a new note from the activity title.
- Add, rename, recolor, reorder, and delete categories.

## Notes and notebooks

On first use, Chronicle uses or creates a notebook named `岁时记`. The notebook is identified by its SiYuan notebook ID, so renaming it does not break Chronicle.

Time notes follow a year → quarter → month → week hierarchy. Notes created from activities follow category → activity title. When the default notebook changes, Chronicle migrates only these plugin-managed notes; existing documents linked from elsewhere remain where they are.

Activities and linked documents remain independent. Moving or renaming a document does not break its link. Deleting a linked document only removes the link, not the activity. When deleting an activity, you can choose whether its linked documents should also be deleted.

## Shortcuts

- `T`: locate today
- `N`: create an activity
- `S`: open settings
- `←` / `→`: change year

Shortcuts work only while the Chronicle panel is visible and no text field or dialog is being edited.

## Build

```bash
pnpm install
pnpm build
pnpm make-install
```

## License

MIT

## Statement

This plugin was developed entirely through vibe coding:

- Claude Code (Fable 5): approximately 30%
- Codex (GPT 5.6 Sol): approximately 70%
