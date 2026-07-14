# Chronicle

[简体中文](./README.md) | English

Chronicle is a record panel organized around time and categories, with links to native SiYuan notes.

Chronicle places concrete activities back into their years, quarters, months, and weeks, gradually turning the passage of time into recognizable landmarks of memory. As records accumulate, the past becomes something that can be distinguished, revisited, and understood through what actually happened within it.

Unlike calendars and to-do lists, Chronicle is not centered on reminders, scheduling, or completion status. It uses time, categories, and notes to build a personal record that can grow over time and remain easy to revisit.

## Features

- View year, quarter, month, and week in one annual panel, move continuously between years, or locate today.
- Record an activity's title, category, time period, exact dates, and note.
- Reorder activities by dragging or move them into another time period.
- Create notes from time nodes and link one or more existing notes to an activity.
- Customize categories and the default notebook to build your own record system.

## Notes and notebooks

On first use, Chronicle uses or creates a notebook named `岁时记`. Notebooks and linked documents are associated by their SiYuan IDs, so moving or renaming them does not break the connection.

When the default notebook changes, Chronicle migrates only notes it created and leaves existing documents linked from elsewhere in place. Activities and notes remain independent: deleting a note does not delete its activity, while deleting an activity lets you choose whether its linked notes should also be removed.

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
