import type { GameDocument, BaitId } from "../../../shared/types";
import { clamp } from "../../../shared/random";
import {
  consumeCraftBait,
  pruneExpired,
  syncResearch,
} from "../../workshop/model/workshop";
import type { BaitBatch } from "../../workshop/model/types";

export function chooseBait(doc: GameDocument, id: BaitId) {
  return availableStock(doc)[id] > 0 ? { ...doc, bait: id } : doc;
}

export function tune(doc: GameDocument, key: "power" | "drag", value: number) {
  return { ...doc, [key]: clamp(value, 0.15, 0.95) };
}

const CRAFTED: BaitId[] = ["paste", "chum"];

/** 当前可用鱼饵库存（基础库存 + 工坊在保鲜期内的成品批次） */
export function availableStock(doc: GameDocument): Record<BaitId, number> {
  const stock = { ...doc.stock };
  for (const bait of CRAFTED) stock[bait] = 0;
  for (const batch of doc.workshop.baitBatches) {
    if (batch.perishAt > doc.clock) stock[batch.bait] += batch.qty;
  }
  return stock;
}

/** 抛竿消耗鱼饵：基础饵走整数库存，特制饵走工坊批次（优先最早到期） */
export function consumeBait(
  doc: GameDocument,
): { doc: GameDocument; baitBatch?: BaitBatch } | null {
  const stock = availableStock(doc);
  if (stock[doc.bait] < 1) return null;
  if (CRAFTED.includes(doc.bait)) {
    const { ws, batch } = consumeCraftBait(doc.workshop, doc.bait, doc.clock);
    return { doc: { ...doc, workshop: ws }, baitBatch: batch ?? undefined };
  }
  return {
    doc: {
      ...doc,
      stock: { ...doc.stock, [doc.bait]: doc.stock[doc.bait] - 1 },
    },
  };
}

export function resupply(doc: GameDocument): GameDocument {
  return {
    ...doc,
    stock: { worm: 24, corn: 20, fly: 16, paste: 0, chum: 0 },
  };
}

/** 推进游戏时钟，并联动工坊过期清理与研究解锁 */
export function advanceClock(doc: GameDocument, deltaMs: number): GameDocument {
  const clock = doc.clock + Math.max(0, deltaMs);
  const pruned = pruneExpired(doc.workshop, clock);
  const researched = syncResearch(pruned, doc.stats.catches, clock);
  // 无过期、无新解锁时复用原引用，避免每 tick 无谓重渲染
  if (clock === doc.clock && researched === doc.workshop) return doc;
  return { ...doc, clock, workshop: researched };
}
