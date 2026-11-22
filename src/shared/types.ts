import type { WorkshopState } from "../features/workshop/model/types";

export type SpotId = "reed" | "brook" | "deep";
export type BaitId = "worm" | "corn" | "fly" | "paste" | "chum";
export type FishId = "crucian" | "perch" | "carp" | "trout" | "bass" | "pike";
export type Phase =
  "ready" | "charging" | "waiting" | "bite" | "fighting" | "landed" | "escaped";
export interface FishSpecies {
  id: FishId;
  name: string;
  latin: string;
  color: string;
  rarity: string;
  min: number;
  max: number;
  strength: number;
  waters: SpotId[];
  baits: BaitId[];
  note: string;
}
export interface Catch {
  id: string;
  fish: FishId;
  weight: number;
  spot: SpotId;
  bait: BaitId;
  /** 使用工坊特制鱼饵时记录成品批次，便于手记追溯配方与批次 */
  baitBatch?: string;
  time: number;
  duration: number;
  peakTension: number;
}
export interface JournalEntry {
  count: number;
  best: number;
  first: number;
}
export interface GameDocument {
  version: 1;
  spot: SpotId;
  bait: BaitId;
  power: number;
  drag: number;
  seed: number;
  stock: Record<BaitId, number>;
  bag: Catch[];
  journal: Partial<Record<FishId, JournalEntry>>;
  stats: { casts: number; catches: number; escapes: number; released: number };
  claimed: string[];
  /** 游戏内时钟（毫秒），驱动原料与成品的到期时间 */
  clock: number;
  /** 鱼饵工坊状态（原料、制作单、成品批次、研究解锁） */
  workshop: WorkshopState;
}
export interface Session {
  id: string;
  phase: Phase;
  clock: number;
  charge: number;
  castPower: number;
  spot: SpotId;
  bait: BaitId;
  /** 本次抛竿若使用工坊特制饵，记录其成品批次 id */
  baitBatch?: string;
  fish: FishId | null;
  weight: number;
  biteAt: number;
  progress: number;
  tension: number;
  energy: number;
  slackTime: number;
  overload: number;
  peak: number;
  reeling: boolean;
  duration: number;
  message: string;
}
export interface Workspace {
  doc: GameDocument;
  session: Session;
  notice: string;
  /** 工坊规划会话态：被固定用料的订单 id（不持久化，刷新后需重新固定） */
  pinned: string[];
}
