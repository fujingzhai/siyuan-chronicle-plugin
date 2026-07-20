# Chronicle

[简体中文](./README.md) | English

Chronicle is a record panel organized around time and categories, with links to native SiYuan notes.

Chronicle records the past: it places concrete activities back into their years, quarters, months, and weeks, gradually turning the passage of time into recognizable landmarks of memory. As records accumulate, the past becomes something that can be distinguished, revisited, and understood through what actually happened within it.

Chronicle also looks ahead: unlike calendars and to-do panels organized around dates and completion states, it can still carry plans. An activity may look back on a period or mark an intention for the next one; years, quarters, months, weeks, and categories give each of them a fitting place.

## Features

- View years, quarters, months, and weeks in the timeline panel, move continuously between years, or locate today.
- Browse the full year in the date panel; category-colored lines appear below dates and support single-day or multi-day activities.
- Record an activity's title, category, time period, exact dates, and note; both panels share activities and categories.
- Reorder activities by dragging or move them into another time period.
- Create notes from time nodes and link one or more existing notes to an activity.
- Customize categories, the default notebook, and the panel-lock message; use the lock button or `L` to temporarily cover the panel.

## Notes and notebooks

On first use, Chronicle uses or creates a notebook named `岁时记`. Notebooks and linked documents are associated by their SiYuan IDs, so moving or renaming them does not break the connection.

When the default notebook changes, Chronicle migrates only notes it created and leaves existing documents linked from elsewhere in place. Activities and notes remain independent: deleting a note does not delete its activity, while deleting an activity lets you choose whether its linked notes should also be removed.

## Shortcuts

- `T`: locate today
- `N`: create an activity in the current panel
- `S`: open settings
- `D` / `W`: switch to the date panel / timeline panel
- `L`: lock or unlock the panel
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

## Support Development — Buy me a token

This plugin was developed entirely through vibe coding:

- Claude Code (Fable 5): approximately 30%
- Codex (GPT 5.6 Sol): approximately 70%

(The figures above are estimates from the plugin's first release; it keeps being updated, always with the most capable models available at the time.)

Top-tier models are expensive and my study schedule is tight, so this work has not come easily. If you like this plugin or benefit from it, you are warmly invited to support its development. I will keep updating it and making the experience better.

Please leave your LianDi (ld246) username or any other social account with your payment, and I will add you to the plugin's sponsor list as a token of my gratitude. Your support is my greatest motivation to create!

| ![WeChat Pay](https://fastly.jsdelivr.net/gh/fujingzhai/siyuan-chronicle-plugin@main/assets/sponsor-wechat.png) | ![Alipay](https://fastly.jsdelivr.net/gh/fujingzhai/siyuan-chronicle-plugin@main/assets/sponsor-alipay.jpg) |
| :---: | :---: |

## Sponsors

- [youxia](https://ld246.com/member/youxia)

