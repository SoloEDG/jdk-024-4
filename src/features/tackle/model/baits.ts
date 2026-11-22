import type { BaitId } from "../../../shared/types";
export const baits: {
  id: BaitId;
  name: string;
  icon: string;
  note: string;
  color: string;
  /** 工坊特制鱼饵（由捕获副产物与采集物制作，受保鲜期约束） */
  crafted?: boolean;
}[] = [
  {
    id: "worm",
    name: "鲜活蚯蚓",
    icon: "〰",
    note: "均衡 · 鲫鱼 / 河鲈",
    color: "#ba8477",
  },
  {
    id: "corn",
    name: "甜玉米粒",
    icon: "⠿",
    note: "素饵 · 锦鲤偏爱",
    color: "#d4ac62",
  },
  {
    id: "fly",
    name: "羽毛拟蝇",
    icon: "⌁",
    note: "拟饵 · 掠食鱼偏爱",
    color: "#779ba0",
  },
  {
    id: "paste",
    name: "醇香面饵",
    icon: "◉",
    note: "工坊 · 浅湾扩散广",
    color: "#cfa46a",
    crafted: true,
  },
  {
    id: "chum",
    name: "浓腥窝饵",
    icon: "✸",
    note: "工坊 · 深水诱大鱼",
    color: "#a8644c",
    crafted: true,
  },
];
export function baitLabel(id: BaitId) {
  return baits.find((b) => b.id === id)?.name ?? id;
}
