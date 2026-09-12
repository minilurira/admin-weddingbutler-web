export const BADGE: Record<string, { bg: string; color: string; dot: string }> = {
  신규요청: { bg: "#F7EAF0", color: "#A8416C", dot: "#D18AA8" },
  협의중: { bg: "#F2F1EC", color: "#7D6F55", dot: "#C7BD9E" },
  확정: { bg: "#EDF1F6", color: "#3F5A7A", dot: "#9BB2C9" },
};

export const STATUS_LIST = ["신규요청", "협의중", "확정"] as const;
export type Status = (typeof STATUS_LIST)[number];
