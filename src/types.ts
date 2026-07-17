export type Unit = "week" | "month" | "quarter" | "year";

export interface PeriodRef {
  unit: Unit;
  /** 周单位下为 ISO 周年，其余为公历年 */
  year: number;
  /** 周 1..53 / 月 1..12 / 季 1..4 / 年恒为 0 */
  num: number;
}

export interface DocRef {
  id: string;
  title: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  desc?: string;
}

export interface Entry {
  id: string;
  title: string;
  categoryId: string | null;
  period: PeriodRef;
  docs: DocRef[];
  /** 备注，作为回看时的提取线索 */
  note: string;
  /** 具体发生日期（可选），如旅行的实际起止日 */
  dates?: { start: string; end?: string };
  /** 仅属于日期面板的活动：必有 dates，不出现在时间视图 */
  dayOnly?: boolean;
  /** 同一时间格内的手动排序序号 */
  order?: number;
  /** 旧版遗留字段，不再使用 */
  done?: boolean;
  created: number;
  updated: number;
}

export interface Settings {
  /** 新建笔记所在笔记本 id */
  notebook: string;
  /** 临时锁定面板时显示的自定义封面文案；留空使用默认文案 */
  lockMessage?: string;
  /** 用户是否明确选择了非默认名称的笔记本 */
  notebookCustomized?: boolean;
  /** 岁时记曾使用过、尚待迁移清理的笔记本 id */
  managedNotebooks?: string[];
  /** 时间轴年份栏手动扩展的边界 */
  yearMin?: number;
  yearMax?: number;
  /** 从年份栏中手动移除的空年份 */
  hiddenYears?: number[];
  /** 时间视图各列宽度（px）：年/季/月/周 */
  cols?: { y: number; q: number; m: number; w: number };
  /** 用户是否拖拽过列宽；否则按面板实际宽度自适应铺满 */
  colsCustomized?: boolean;
}

export interface LedgerData {
  version: 4;
  categories: Category[];
  entries: Entry[];
  settings: Settings;
}

/** 时间视图的协调默认列宽；拖拽后的用户设置会覆盖它。 */
export const DEFAULT_TIME_COLS = { y: 160, q: 160, m: 480, w: 800 };

/** 临时锁屏的默认封面文案。 */
export const DEFAULT_LOCK_MESSAGE = "此间清寂，且候归人。";
