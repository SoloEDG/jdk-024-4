import type {
  BaitBatch,
  CraftOrder,
  GroupPlan,
  IngredientBatch,
  IngredientId,
  Quality,
  ResearchRecord,
  WorkshopState,
} from "./types";
import { ingredientInfo, recipeOf, recipes } from "./catalog";
import { planGroup } from "../lib/planner";

const DAY = 86400_000;

export function emptyWorkshop(): WorkshopState {
  return {
    ingredients: [],
    orders: [],
    baitBatches: [],
    research: [],
    batchLog: [],
    seq: 1,
  };
}

function nextId(ws: WorkshopState, prefix: string) {
  ws.seq += 1;
  return `${prefix}-${ws.seq}`;
}

/** 研究：累计捕获数达到门槛即解锁配方（可追溯） */
export function syncResearch(ws: WorkshopState, catches: number, now: number): WorkshopState {
  const owned = new Set(ws.research.map((r) => r.recipeId));
  const newly: ResearchRecord[] = [];
  for (const r of recipes) {
    if (!owned.has(r.id) && catches >= r.researchRequired) {
      newly.push({ recipeId: r.id, unlockedAt: now, catchesAtUnlock: catches });
    }
  }
  if (newly.length === 0) return ws;
  return { ...ws, research: [...ws.research, ...newly] };
}

export function isResearched(ws: WorkshopState, recipeId: string) {
  return ws.research.some((r) => r.recipeId === recipeId);
}

/** 采集/获得一份原料批次（数量、成分、品质、到期时间俱全） */
export function gainIngredient(
  ws: WorkshopState,
  kind: IngredientId,
  qty: number,
  quality: Quality,
  now: number,
  origin: string,
): WorkshopState {
  const info = ingredientInfo(kind);
  // 品质影响香味与保鲜：高品质更香、更耐放
  const qualityAroma = [0, 0.85, 1, 1.15][quality];
  const qualityLife = [0, 0.8, 1, 1.25][quality];
  const batch: IngredientBatch = {
    id: nextId(ws, "ing"),
    kind,
    qty,
    nutrition: { ...info.nutrition },
    aroma: Math.round(info.baseAroma * qualityAroma),
    quality,
    perishAt: now + Math.round(info.baseShelfLife * qualityLife),
    origin,
  };
  return { ...ws, ingredients: [...ws.ingredients, batch] };
}

/** 清理过期原料（到期不可再用，直接剔除并保留其余批次） */
export function pruneExpired(ws: WorkshopState, now: number): WorkshopState {
  const ingredients = ws.ingredients.filter((b) => b.perishAt > now);
  const baitBatches = ws.baitBatches.filter((b) => b.perishAt > now);
  if (
    ingredients.length === ws.ingredients.length &&
    baitBatches.length === ws.baitBatches.length
  )
    return ws;
  return { ...ws, ingredients, baitBatches };
}

/** 新建一张制作单（规划中，未占用库存） */
export function addOrder(
  ws: WorkshopState,
  recipeId: CraftOrder["recipeId"],
  outputQty: number,
  now: number,
): WorkshopState {
  if (!isResearched(ws, recipeId) || outputQty < 1) return ws;
  const recipe = recipeOf(recipeId);
  const order: CraftOrder = {
    id: nextId(ws, "ord"),
    recipeId,
    outputQty,
    status: "planning",
    allocation: {},
    stages: recipe.groups.map((g) => ({
      need: g.amount * outputQty,
      fed: 0,
    })),
    mixed: {},
    mixedPerishAt: null,
    createdAt: now,
  };
  return { ...ws, orders: [...ws.orders, order] };
}

export function removeOrder(ws: WorkshopState, id: string): WorkshopState {
  const order = ws.orders.find((o) => o.id === id);
  // 仅规划中的单子可直接删除；开工单需走取消退料流程
  if (!order || order.status !== "planning") return ws;
  return { ...ws, orders: ws.orders.filter((o) => o.id !== id) };
}

/**
 * 开工：必须重新核对整组计划在当前库存下仍可行
 * （预览期间可能已抛竿消耗库存）。核对通过才把规划单转为运行中。
 */
export function startOrders(
  ws: WorkshopState,
  pinned: string[],
  now: number,
): { ws: WorkshopState; plan: GroupPlan; ok: boolean } {
  const planning = ws.orders.filter((o) => o.status === "planning");
  if (planning.length === 0) {
    return { ws, plan: planGroup({ now, ingredients: ws.ingredients, orders: [], pinned }), ok: false };
  }
  const plan = planGroup({ now, ingredients: ws.ingredients, orders: planning, pinned });
  if (!plan.allFeasible) return { ws, plan, ok: false };
  const byOrder = new Map(plan.orders.map((p) => [p.orderId, p]));
  const orders = ws.orders.map((o) => {
    const p = byOrder.get(o.id);
    if (!p || o.status !== "planning") return o;
    return {
      ...o,
      status: "running" as const,
      allocation: { ...p.allocation },
      stages: o.stages.map((st) => ({ ...st, fed: 0 })),
      mixed: {},
      mixedPerishAt: null,
    };
  });
  return { ws: { ...ws, orders }, plan, ok: true };
}

/** 运行单的总投料需求与已投数量 */
export function orderProgress(o: CraftOrder) {
  const need = o.stages.reduce((n, s) => n + s.need, 0);
  const fed = o.stages.reduce((n, s) => n + s.fed, 0);
  return { need, fed, ratio: need ? fed / need : 0 };
}

/**
 * 分段投料：把某原料批次的一份（或多份）投入运行中订单的指定段。
 * 真实消耗原料库存；进入混合料。重新混合不会延长旧成分期限。
 */
export function feedStage(
  ws: WorkshopState,
  orderId: string,
  stageIndex: number,
  batchId: string,
  amount: number,
  now: number,
): WorkshopState {
  const order = ws.orders.find((o) => o.id === orderId);
  const batch = ws.ingredients.find((b) => b.id === batchId);
  if (!order || order.status !== "running" || !batch || batch.perishAt <= now)
    return ws;
  const stage = order.stages[stageIndex];
  const recipe = recipeOf(order.recipeId);
  const group = recipe.groups[stageIndex];
  if (!stage || !group || !group.alternatives.includes(batch.kind)) return ws;
  const space = stage.need - stage.fed;
  const used = Math.min(amount, space, batch.qty);
  if (used <= 0) return ws;

  // 真实扣减原料
  const ingredients = ws.ingredients
    .map((b) => (b.id === batchId ? { ...b, qty: b.qty - used } : b))
    .filter((b) => b.qty > 0);

  // 混合料累计（带批次快照）；期限取最早到期批次，重新混合不能延长旧成分期限
  const prior = order.mixed[batchId];
  const mixed = {
    ...order.mixed,
    [batchId]: {
      batchId,
      kind: batch.kind,
      amount: (prior?.amount ?? 0) + used,
      quality: batch.quality,
      perishAt: batch.perishAt,
    },
  };
  const mixedPerishAt =
    order.mixedPerishAt === null
      ? batch.perishAt
      : Math.min(order.mixedPerishAt, batch.perishAt);

  const orders = ws.orders.map((o) =>
    o.id === orderId
      ? {
          ...o,
          stages: o.stages.map((s, i) =>
            i === stageIndex ? { ...s, fed: s.fed + used } : s,
          ),
          mixed,
          mixedPerishAt,
        }
      : o,
  );
  return { ...ws, ingredients, orders };
}

/** 取消订单：只退还未使用部分；已进入混合料的不退（已消耗） */
export function cancelOrder(ws: WorkshopState, id: string): WorkshopState {
  const order = ws.orders.find((o) => o.id === id);
  if (!order || order.status !== "running") return ws;
  // 已投料（mixed）不退还；规划 allocation 从未真正占用，无需退
  return {
    ...ws,
    orders: ws.orders.map((o) =>
      o.id === id ? { ...o, status: "cancelled" as const } : o,
    ),
  };
}

/** 完工：全部段投满后产出成品批次，记录实际配方与批次，进入捕获手记可追溯 */
export function completeOrder(ws: WorkshopState, id: string, now: number): WorkshopState {
  const order = ws.orders.find((o) => o.id === id);
  if (!order || order.status !== "running") return ws;
  const { need, fed } = orderProgress(order);
  if (fed < need) return ws;

  // 成品保鲜期 = 混合料最早到期时间（重新混合不能延长）
  const perishAt = order.mixedPerishAt ?? now + recipeOf(order.recipeId).minFreshness;
  const usedAllocation: Record<string, number> = {};
  const usedIngredients: BaitBatch["usedIngredients"] = [];
  for (const [bid, p] of Object.entries(order.mixed)) {
    usedAllocation[bid] = p.amount;
    usedIngredients.push({ batchId: bid, kind: p.kind, amount: p.amount });
  }
  const qualityAvg = averageQuality(order.mixed);

  const product: BaitBatch = {
    id: nextId(ws, "bait"),
    bait: order.recipeId,
    qty: order.outputQty,
    perishAt,
    recipeId: order.recipeId,
    usedAllocation,
    usedIngredients,
    quality: Math.round(qualityAvg * 10) / 10,
    createdAt: now,
  };

  return {
    ...ws,
    orders: ws.orders.map((o) =>
      o.id === id ? { ...o, status: "done" as const } : o,
    ),
    baitBatches: [...ws.baitBatches, product],
    batchLog: [...ws.batchLog, product],
  };
}

/** 按投料快照加权计算混合料平均品质（批次已耗尽也不受影响） */
function averageQuality(mixed: Record<string, import("./types").MixedPortion>) {
  let qty = 0;
  let sum = 0;
  for (const p of Object.values(mixed)) {
    sum += p.quality * p.amount;
    qty += p.amount;
  }
  return qty ? sum / qty : 2;
}

/** 抛竿消耗一个特制鱼饵（优先用最早到期批次，减少浪费） */
export function consumeCraftBait(
  ws: WorkshopState,
  bait: string,
  now: number,
): { ws: WorkshopState; batch: BaitBatch | null } {
  const usable = ws.baitBatches
    .filter((b) => b.bait === bait && b.qty > 0 && b.perishAt > now)
    .sort((a, b) => a.perishAt - b.perishAt);
  const target = usable[0];
  if (!target) return { ws, batch: null };
  const baitBatches = ws.baitBatches
    .map((b) => (b.id === target.id ? { ...b, qty: b.qty - 1 } : b))
    .filter((b) => b.qty > 0);
  return { ws: { ...ws, baitBatches }, batch: target };
}

/** 特制鱼饵总库存（跨批次合计，过滤过期） */
export function craftStock(ws: WorkshopState, now: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of ws.baitBatches) {
    if (b.perishAt <= now) continue;
    out[b.bait] = (out[b.bait] ?? 0) + b.qty;
  }
  return out;
}

export const TIME = { DAY };
