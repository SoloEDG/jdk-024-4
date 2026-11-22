import type {
  CraftOrder,
  GroupPlan,
  IngredientBatch,
  NutritionClass,
  OrderPlan,
  Recipe,
} from "../model/types";
import { recipeOf } from "../model/catalog";

const NUTRITION: NutritionClass[] = ["protein", "carb", "fat"];
/** 搜索节点预算；预算内仍未结束时不得宣称缺料 */
const NODE_BUDGET = 200_000;

interface Slot {
  key: string;
  orderId: string;
  candidates: string[]; // 候选批次 id（确定性顺序）
}

interface OrderAcc {
  recipe: Recipe;
  totalUnits: number;
  nutrition: Record<NutritionClass, number>;
  aromaSum: number;
  minPerish: number; // 绝对时间戳，Infinity 表示尚未投料
}

export interface PlannerInput {
  now: number;
  ingredients: IngredientBatch[];
  orders: CraftOrder[];
  /** 被固定用料的订单 id（沿用其 allocation，不再参与搜索） */
  pinned: string[];
}

/** 一份批次是否可用：未过期、未耗尽、种类匹配 */
function batchFits(b: IngredientBatch, now: number, kinds: string[]) {
  return b.qty > 0 && b.perishAt > now && kinds.includes(b.kind);
}

function emptyNutrition(): Record<NutritionClass, number> {
  return { protein: 0, carb: 0, fat: 0 };
}

/** 校验某订单累计投料是否满足营养比例、香味区间与成品最低保鲜期 */
function orderSatisfied(acc: OrderAcc, now: number): boolean {
  const total = NUTRITION.reduce((n, k) => n + acc.nutrition[k], 0);
  if (total <= 0 || acc.minPerish === Infinity) return false;
  for (const k of NUTRITION) {
    const ratio = acc.nutrition[k] / total;
    if (
      ratio < acc.recipe.nutritionRatio.min[k] - 1e-9 ||
      ratio > acc.recipe.nutritionRatio.max[k] + 1e-9
    )
      return false;
  }
  const aroma = acc.aromaSum / acc.totalUnits;
  if (
    aroma < acc.recipe.aromaRange[0] - 1e-9 ||
    aroma > acc.recipe.aromaRange[1] + 1e-9
  )
    return false;
  // 成品保鲜期 = 最早到期原料的剩余期限，必须不低于配方最低要求
  if (acc.minPerish - now < acc.recipe.minFreshness - 1e-9) return false;
  return true;
}

function ratioOf(n: Record<NutritionClass, number>) {
  const total = NUTRITION.reduce((s, k) => s + n[k], 0);
  return {
    protein: total ? n.protein / total : 0,
    carb: total ? n.carb / total : 0,
    fat: total ? n.fat / total : 0,
  };
}

/**
 * 多订单全局规划。
 * 完整回溯搜索一组让所有订单同时可行的配料方案，
 * 不会只给第一单选最优原料而饿死后续订单（MRV + 全局共享库存）。
 */
export function planGroup(input: PlannerInput): GroupPlan {
  const { now, ingredients, pinned } = input;
  const batchById = new Map(ingredients.map((b) => [b.id, b]));

  // 共享剩余容量：所有订单竞争同一份库存
  const remaining = new Map<string, number>();
  for (const b of ingredients) remaining.set(b.id, b.qty);

  const pinnedSet = new Set(pinned);
  const pinnedPlans = new Map<string, OrderPlan>();

  // 1) 落地固定用料订单，先从共享库存扣除并校验
  let pinBroken = false;
  for (const order of input.orders) {
    if (!pinnedSet.has(order.id)) continue;
    const recipe = recipeOf(order.recipeId);
    const expectedUnits =
      recipe.groups.reduce((n, g) => n + g.amount, 0) * order.outputQty;
    const acc: OrderAcc = {
      recipe,
      totalUnits: expectedUnits,
      nutrition: emptyNutrition(),
      aromaSum: 0,
      minPerish: Infinity,
    };
    let ok = true;
    for (const [bid, amount] of Object.entries(order.allocation)) {
      const b = batchById.get(bid);
      if (!b || b.perishAt <= now || amount > (remaining.get(bid) ?? 0)) {
        ok = false;
        break;
      }
      remaining.set(bid, (remaining.get(bid) ?? 0) - amount);
      for (const k of NUTRITION) acc.nutrition[k] += b.nutrition[k] * amount;
      acc.aromaSum += b.aroma * amount;
      acc.minPerish = Math.min(acc.minPerish, b.perishAt);
    }
    const used = Object.values(order.allocation).reduce((n, v) => n + v, 0);
    const feasibleNow = ok && used === expectedUnits && orderSatisfied(acc, now);
    if (!feasibleNow) pinBroken = true;
    pinnedPlans.set(order.id, {
      orderId: order.id,
      recipeId: order.recipeId,
      allocation: feasibleNow ? { ...order.allocation } : {},
      feasible: feasibleNow,
      gaps: feasibleNow
        ? []
        : ["固定用料已不满足当前库存或配方约束，请解除固定后重新规划。"],
      expectedFreshness: acc.minPerish === Infinity ? 0 : acc.minPerish - now,
      expectedAroma: expectedUnits ? acc.aromaSum / expectedUnits : 0,
      expectedRatio: ratioOf(acc.nutrition),
    });
  }

  // 2) 为未固定订单构建“单份投料”槽位变量
  const slots: Slot[] = [];
  for (const order of input.orders) {
    if (pinnedSet.has(order.id)) continue;
    const recipe = recipeOf(order.recipeId);
    recipe.groups.forEach((group, gi) => {
      for (let u = 0; u < group.amount * order.outputQty; u++) {
        slots.push({
          key: `${order.id}#${gi}#${u}`,
          orderId: order.id,
          candidates: ingredients
            .filter((b) => batchFits(b, now, group.alternatives))
            .map((b) => b.id),
        });
      }
    });
  }

  const accMap = new Map<string, OrderAcc>();
  for (const order of input.orders) {
    if (pinnedSet.has(order.id)) continue;
    const recipe = recipeOf(order.recipeId);
    accMap.set(order.id, {
      recipe,
      totalUnits: recipe.groups.reduce((n, g) => n + g.amount, 0) * order.outputQty,
      nutrition: emptyNutrition(),
      aromaSum: 0,
      minPerish: Infinity,
    });
  }

  const assignment = new Map<string, string>(); // slotKey -> batchId
  let nodes = 0;
  let exhausted = true;
  let found = false;

  /** 回滚后重算某订单最早到期时间（min 无法增量还原） */
  function recomputeMinPerish(orderId: string): number {
    let min = Infinity;
    for (const [key, bid] of assignment) {
      if (!key.startsWith(orderId + "#")) continue;
      const b = batchById.get(bid);
      if (b) min = Math.min(min, b.perishAt);
    }
    return min;
  }

  function dfs(depth: number): boolean {
    if (nodes++ > NODE_BUDGET) {
      exhausted = false; // 搜索未结束，禁止宣称缺料
      return false;
    }
    if (depth >= slots.length) {
      for (const [, acc] of accMap) if (!orderSatisfied(acc, now)) return false;
      return true;
    }
    // MRV：选当前可用候选最少的槽位（最受约束者优先）
    let chosen = -1;
    let bestScore = Infinity;
    for (let i = depth; i < slots.length; i++) {
      let score = 0;
      for (const bid of slots[i].candidates) if ((remaining.get(bid) ?? 0) > 0) score++;
      if (score < bestScore) {
        bestScore = score;
        chosen = i;
      }
    }
    if (bestScore === 0) return false; // 无料可用，剪枝
    [slots[depth], slots[chosen]] = [slots[chosen], slots[depth]];
    const slot = slots[depth];
    const acc = accMap.get(slot.orderId)!;

    for (const bid of slot.candidates) {
      if ((remaining.get(bid) ?? 0) <= 0) continue;
      const b = batchById.get(bid)!;
      for (const k of NUTRITION) acc.nutrition[k] += b.nutrition[k];
      acc.aromaSum += b.aroma;
      acc.minPerish = Math.min(acc.minPerish, b.perishAt);
      remaining.set(bid, (remaining.get(bid) ?? 0) - 1);
      assignment.set(slot.key, bid);

      if (dfs(depth + 1)) return true;

      assignment.delete(slot.key);
      remaining.set(bid, (remaining.get(bid) ?? 0) + 1);
      acc.minPerish = recomputeMinPerish(slot.orderId);
      acc.aromaSum -= b.aroma;
      for (const k of NUTRITION) acc.nutrition[k] -= b.nutrition[k];
    }
    return false;
  }

  if (!pinBroken) found = slots.length === 0 ? true : dfs(0);

  // 3) 汇总每单规划
  const orderPlans: OrderPlan[] = input.orders.map((order) => {
    if (pinnedSet.has(order.id)) return pinnedPlans.get(order.id)!;
    const acc = accMap.get(order.id)!;
    const allocation: Record<string, number> = {};
    if (found) {
      for (const [key, bid] of assignment) {
        if (!key.startsWith(order.id + "#")) continue;
        allocation[bid] = (allocation[bid] ?? 0) + 1;
      }
    }
    return {
      orderId: order.id,
      recipeId: order.recipeId,
      allocation: found ? allocation : {},
      feasible: found,
      gaps:
        found || !exhausted
          ? found
            ? []
            : ["搜索尚未结束，无法判定缺料；请减少订单或固定部分用料后重试。"]
          : diagnoseGaps(order, ingredients, now),
      expectedFreshness: acc.minPerish === Infinity ? 0 : acc.minPerish - now,
      expectedAroma: acc.totalUnits ? acc.aromaSum / acc.totalUnits : 0,
      expectedRatio: ratioOf(acc.nutrition),
    };
  });

  const leftovers: Record<string, number> = {};
  for (const b of ingredients) leftovers[b.id] = remaining.get(b.id) ?? b.qty;

  const allFeasible =
    !pinBroken &&
    exhausted &&
    orderPlans.every((p) => p.feasible);

  return {
    orders: orderPlans,
    leftovers,
    allFeasible,
    exhausted,
    pinned: [...pinnedSet],
  };
}

/** 不可行诊断：按原料组与约束给出可读缺口，而非笼统“缺料” */
function diagnoseGaps(
  order: CraftOrder,
  ingredients: IngredientBatch[],
  now: number,
): string[] {
  const recipe = recipeOf(order.recipeId);
  const gaps: string[] = [];
  recipe.groups.forEach((g) => {
    const need = g.amount * order.outputQty;
    const matching = ingredients.filter(
      (b) => b.qty > 0 && b.perishAt > now && g.alternatives.includes(b.kind),
    );
    const avail = matching.reduce((n, b) => n + b.qty, 0);
    if (avail < need) {
      gaps.push(`${g.label}缺 ${need - avail} 份（需 ${need}，可用 ${avail}）`);
      return;
    }
    // 成品最低保鲜要求每一份投料的剩余期限都达标，按组核对足量保鲜份数
    const fresh = matching
      .filter((b) => b.perishAt - now >= recipe.minFreshness)
      .reduce((n, b) => n + b.qty, 0);
    if (fresh < need) {
      gaps.push(
        `${g.label}保鲜不足：需 ${need} 份剩余保鲜≥${Math.ceil(recipe.minFreshness / 86400_000)} 天，仅 ${fresh} 份达标`,
      );
    }
  });
  if (gaps.length === 0)
    gaps.push("数量足够，但营养比例或香味区间无法同时满足，可调整订单搭配或固定用料。");
  return gaps;
}
