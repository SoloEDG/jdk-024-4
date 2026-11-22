import { planGroup } from "../src/features/workshop/lib/planner";
import {
  emptyWorkshop,
  gainIngredient,
  addOrder,
  startOrders,
  feedStage,
  cancelOrder,
  completeOrder,
  syncResearch,
  consumeCraftBait,
  orderProgress,
  craftStock,
} from "../src/features/workshop/model/workshop";
import { recipeOf } from "../src/features/workshop/model/catalog";
import type { IngredientBatch, CraftOrder, WorkshopState } from "../src/features/workshop/model/types";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log("  ✔", msg);
  } else {
    failed++;
    console.error("  ✘", msg);
  }
}

const DAY = 86400_000;
const NOW = 10 * DAY;

function batch(
  id: string,
  kind: IngredientBatch["kind"],
  qty: number,
  perishDays: number,
  aroma: number,
  nutrition: IngredientBatch["nutrition"],
  quality: 1 | 2 | 3 = 2,
): IngredientBatch {
  return { id, kind, qty, nutrition, aroma, quality, perishAt: NOW + perishDays * DAY, origin: "test" };
}

function planningOrder(ws: WorkshopState, recipeId: "paste" | "chum", qty: number): CraftOrder {
  const r = recipeOf(recipeId);
  return {
    id: `ord-${recipeId}-${qty}-${Math.random().toString(36).slice(2, 6)}`,
    recipeId,
    outputQty: qty,
    status: "planning",
    allocation: {},
    stages: r.groups.map((g) => ({ need: g.amount * qty, fed: 0 })),
    mixed: {},
    mixedPerishAt: null,
    createdAt: NOW,
  };
}

// ---- 场景 1：多单共存，贪心逐单会饿死第二单，全局搜索必须找到解 ----
console.log("场景1 多单全局共存（避免饿死后单）");
{
  // 蛋白添料组只有一批稀缺的杂鱼粉，两张面饵单都需要它；
  // 碳水/黏合料充足。贪心把鱼粉全给第一单会让第二单无解，
  // 但全局分配（每单各取所需）可同时成立。
  const ingredients = [
    batch("b-corn", "cornmeal", 8, 9, 40, { protein: 1, carb: 8, fat: 1 }),
    batch("b-berry", "berry", 6, 6, 52, { protein: 0, carb: 7, fat: 1 }),
    batch("b-fishmeal", "fishmeal", 2, 7, 55, { protein: 8, carb: 0, fat: 2 }), // 恰好每单 1 份
    batch("b-moss", "moss", 6, 8, 28, { protein: 2, carb: 4, fat: 0 }),
    batch("b-clay", "clay", 6, 12, 12, { protein: 0, carb: 2, fat: 0 }),
  ];
  const o1 = planningOrder(emptyWorkshop(), "paste", 1);
  const o2 = planningOrder(emptyWorkshop(), "paste", 1);
  const plan = planGroup({ now: NOW, ingredients, orders: [o1, o2], pinned: [] });
  assert(plan.exhausted, "搜索完整结束");
  assert(plan.allFeasible, "两单同时可行（没有饿死第二单）");
  const p1 = plan.orders.find((p) => p.orderId === o1.id)!;
  const p2 = plan.orders.find((p) => p.orderId === o2.id)!;
  assert((p1.allocation["b-fishmeal"] ?? 0) === 1, "第一单只用 1 份稀缺鱼粉");
  assert((p2.allocation["b-fishmeal"] ?? 0) === 1, "第二单也拿到 1 份稀缺鱼粉");
  assert(plan.leftovers["b-fishmeal"] === 0, "稀缺鱼粉恰好用尽");
}

// ---- 场景 2：确实缺料时，完整搜索后给出缺口，而非误判 ----
console.log("场景2 真实缺料诊断");
{
  const ingredients = [
    batch("c-corn", "cornmeal", 2, 9, 40, { protein: 1, carb: 8, fat: 1 }),
    // 没有任何蛋白添料
    batch("c-moss", "moss", 4, 8, 28, { protein: 2, carb: 4, fat: 0 }),
  ];
  const o = planningOrder(emptyWorkshop(), "paste", 1);
  const plan = planGroup({ now: NOW, ingredients, orders: [o], pinned: [] });
  assert(plan.exhausted, "搜索完整结束才下结论");
  assert(!plan.allFeasible, "判定为不可行");
  const p = plan.orders[0];
  assert(p.gaps.length > 0 && p.gaps.some((g) => g.includes("蛋白添料")), "给出具体原料组缺口");
}

// ---- 场景 3：保鲜期不足被判不可行 ----
console.log("场景3 成品最低保鲜期约束");
{
  // 面饵要求最低保鲜 5 天；放一批 2 天后到期的黏合料，且只有它可用
  const ingredients = [
    batch("d-corn", "cornmeal", 4, 9, 40, { protein: 1, carb: 8, fat: 1 }),
    batch("d-fishmeal", "fishmeal", 2, 7, 55, { protein: 8, carb: 0, fat: 2 }),
    batch("d-clay-soon", "clay", 4, 2, 12, { protein: 0, carb: 2, fat: 0 }), // 2 天 < 5 天
  ];
  const o = planningOrder(emptyWorkshop(), "paste", 1);
  const plan = planGroup({ now: NOW, ingredients, orders: [o], pinned: [] });
  assert(!plan.allFeasible, "保鲜期不足时不可行");
  assert(plan.orders[0].gaps.some((g) => g.includes("保鲜")), "提示保鲜期缺口");
}

// ---- 场景 4：固定某单用料后重算其他单 ----
console.log("场景4 固定用料与重算");
{
  const ingredients = [
    batch("e-corn", "cornmeal", 4, 9, 40, { protein: 1, carb: 8, fat: 1 }),
    batch("e-berry", "berry", 4, 6, 52, { protein: 0, carb: 7, fat: 1 }),
    batch("e-fishmeal", "fishmeal", 2, 7, 55, { protein: 8, carb: 0, fat: 2 }),
    batch("e-shrimp", "shrimp", 2, 6, 64, { protein: 7, carb: 1, fat: 1 }),
    batch("e-moss", "moss", 4, 8, 28, { protein: 2, carb: 4, fat: 0 }),
    batch("e-clay", "clay", 4, 12, 12, { protein: 0, carb: 2, fat: 0 }),
  ];
  const o1 = planningOrder(emptyWorkshop(), "paste", 1);
  const o2 = planningOrder(emptyWorkshop(), "paste", 1);
  // 先求一个全局方案，固定 o1
  const first = planGroup({ now: NOW, ingredients, orders: [o1, o2], pinned: [] });
  assert(first.allFeasible, "初始两单可行");
  const pinnedAlloc = first.orders.find((p) => p.orderId === o1.id)!.allocation;
  o1.allocation = pinnedAlloc;
  const again = planGroup({ now: NOW, ingredients, orders: [o1, o2], pinned: [o1.id] });
  assert(again.allFeasible, "固定 o1 后 o2 仍可重算出可行方案");
  assert(
    JSON.stringify(again.orders.find((p) => p.orderId === o1.id)!.allocation) ===
      JSON.stringify(pinnedAlloc),
    "固定单严格沿用其 allocation",
  );
}

// ---- 场景 5：开工核对——预览后库存被抛竿消耗，开工必须失败 ----
console.log("场景5 开工整组复核");
{
  let ws = emptyWorkshop();
  ws = syncResearch(ws, 99, NOW); // 解锁全部配方
  ws = gainIngredient(ws, "cornmeal", 4, 2, NOW, "t");
  ws = gainIngredient(ws, "fishmeal", 2, 2, NOW, "t");
  ws = gainIngredient(ws, "moss", 4, 2, NOW, "t");
  ws = addOrder(ws, "paste", 1, NOW);
  const before = startOrders(ws, [], NOW);
  assert(before.ok, "库存充足时开工通过");
  // 模拟预览期间抛竿/采集消耗：把关键原料数量改为不足
  const depleted: WorkshopState = {
    ...ws,
    ingredients: ws.ingredients.map((b) =>
      b.kind === "fishmeal" ? { ...b, qty: 0 } : b,
    ),
  };
  const after = startOrders(depleted, [], NOW);
  assert(!after.ok, "库存被消耗后开工复核失败（不允许占用不可行计划）");
}

// ---- 场景 6：分段投料、取消只退未用、重新混合不延长期限 ----
console.log("场景6 分段投料 / 取消退料 / 保鲜不延长");
{
  let ws = emptyWorkshop();
  ws = syncResearch(ws, 99, NOW);
  ws = gainIngredient(ws, "cornmeal", 4, 2, NOW, "t"); // 默认较长保鲜
  ws = gainIngredient(ws, "fishmeal", 2, 2, NOW, "t");
  ws = gainIngredient(ws, "moss", 4, 2, NOW, "t");
  ws = addOrder(ws, "paste", 1, NOW);
  const started = startOrders(ws, [], NOW);
  assert(started.ok, "开工");
  ws = started.ws;
  const order = ws.orders[0];
  // 找到各段第一批匹配原料并各投 1 份
  const r = recipeOf(order.recipeId);
  let totalFed = 0;
  r.groups.forEach((g, gi) => {
    const b = ws.ingredients.find((x) => g.alternatives.includes(x.kind))!;
    ws = feedStage(ws, order.id, gi, b.id, 1, NOW);
    totalFed++;
  });
  const running = ws.orders[0];
  assert(orderProgress(running).fed === totalFed, "分段投料累计正确");
  // 取消：已投部分不退，未投料原料保持在库
  const ingredientCountBefore = ws.ingredients.reduce((n, b) => n + b.qty, 0);
  ws = cancelOrder(ws, order.id);
  const ingredientCountAfter = ws.ingredients.reduce((n, b) => n + b.qty, 0);
  assert(ingredientCountAfter === ingredientCountBefore, "取消不退还已进入混合料的部分");
  assert(ws.orders[0].status === "cancelled", "订单标记为已取消");
}

console.log("场景7 重新混合不延长 + 完工成品期限=最早原料");
{
  let ws = emptyWorkshop();
  ws = syncResearch(ws, 99, NOW);
  // 手动构造：先投长保鲜，再投短保鲜
  ws = gainIngredient(ws, "cornmeal", 4, 2, NOW, "t");
  ws = gainIngredient(ws, "fishmeal", 2, 2, NOW, "t");
  ws = gainIngredient(ws, "moss", 4, 2, NOW, "t");
  // 追加一份很快到期的玉米碎批次
  ws = gainIngredient(ws, "cornmeal", 2, 2, NOW, "t");
  const soonBatch = ws.ingredients[ws.ingredients.length - 1];
  const originalPerish = soonBatch.perishAt;
  soonBatch.perishAt = NOW + 1 * DAY; // 强制 1 天到期
  ws = addOrder(ws, "paste", 1, NOW);
  ws = startOrders(ws, [], NOW).ws;
  const order = ws.orders[0];
  const r = recipeOf(order.recipeId);
  // 段0（碳水）优先投短保鲜批次
  ws = feedStage(ws, order.id, 0, soonBatch.id, 1, NOW);
  r.groups.forEach((g, gi) => {
    if (gi === 0) return;
    const b = ws.ingredients.find((x) => g.alternatives.includes(x.kind) && x.id !== soonBatch.id)!;
    ws = feedStage(ws, order.id, gi, b.id, 1, NOW);
  });
  // 段0 还需 1 份，投长保鲜的玉米 -> 重新混合不得延长期限
  const longCorn = ws.ingredients.find((x) => x.kind === "cornmeal" && x.id !== soonBatch.id)!;
  ws = feedStage(ws, order.id, 0, longCorn.id, 1, NOW);
  const mixed = ws.orders[0];
  assert(mixed.mixedPerishAt === NOW + 1 * DAY, "混合料期限锁定为最早到期，重新混合不延长");
  ws = completeOrder(ws, order.id, NOW);
  const product = ws.baitBatches[0];
  assert(!!product, "产出成品批次");
  assert(product.perishAt === NOW + 1 * DAY, "成品保鲜期等于最早原料期限");
  assert(product.usedIngredients.length >= 3, "成品记录实际投料种类快照");
  // 抛竿消耗：FIFO 最早到期
  const { batch: used } = consumeCraftBait(ws, "paste", NOW);
  assert(used?.id === product.id, "特制饵抛竿从成品批次扣减");
}

// ---- 场景 8：刷新不复制、不重复占用（序号单调 + 状态持久化结构）----
console.log("场景8 序号单调，刷新不重复占用");
{
  let ws = emptyWorkshop();
  const seq0 = ws.seq;
  ws = gainIngredient(ws, "clay", 3, 2, NOW, "t");
  ws = gainIngredient(ws, "berry", 2, 1, NOW, "t");
  ws = gainIngredient(ws, "fishmeal", 2, 2, NOW, "t");
  assert(ws.seq === seq0 + 3, "每次获得批次序号递增，id 不重复");
  const ids = new Set(ws.ingredients.map((b) => b.id));
  assert(ids.size === ws.ingredients.length, "批次 id 唯一，刷新不会复制原料");
  // 运行单进度持久化在 order.stages/mixed 内，重新加载不会再次扣库存（纯数据校验）
  ws = syncResearch(ws, 99, NOW);
  ws = addOrder(ws, "paste", 1, NOW);
  ws = startOrders(ws, [], NOW).ws;
  // 第 0 段为碳水基底（玉米碎/山浆果），用库存中实际存在的匹配原料投料
  const stage0Kinds = recipeOf("paste").groups[0].alternatives;
  const stage0Batch = ws.ingredients.find((b) => stage0Kinds.includes(b.kind))!;
  ws = feedStage(ws, ws.orders[0].id, 0, stage0Batch.id, 1, NOW);
  const snapshot = JSON.parse(JSON.stringify(ws));
  const reloaded = snapshot as WorkshopState;
  const fedAfterReload = reloaded.orders[0].stages[0].fed;
  assert(fedAfterReload === 1, "刷新后已投料进度保留，不会重新占用一次原料");
}

// ---- 场景 9：端到端完整流程（研究解锁→建单→规划→开工→投料→完工→入盒）----
console.log("场景9 端到端制作流程");
{
  let ws = emptyWorkshop();
  // 未解锁时建单被拒
  ws = addOrder(ws, "chum", 1, NOW);
  assert(ws.orders.length === 0, "未研究解锁的配方不能建单");
  // 累计捕获达标后解锁
  ws = syncResearch(ws, recipeOf("chum").researchRequired, NOW);
  assert(ws.research.some((r) => r.recipeId === "chum"), "浓腥窝饵研究解锁可追溯");
  // 配齐浓腥窝饵原料：2 腥香 + 1 提腥 + 1 黏合（提腥用高香飞虫以满足香味下限）
  ws = gainIngredient(ws, "fishmeal", 2, 3, NOW, "副产物");
  ws = gainIngredient(ws, "shrimp", 1, 3, NOW, "副产物");
  ws = gainIngredient(ws, "insect", 1, 3, NOW, "采集");
  ws = gainIngredient(ws, "clay", 1, 2, NOW, "采集");
  ws = addOrder(ws, "chum", 1, NOW);
  assert(ws.orders.length === 1, "已解锁配方成功建单");
  const started = startOrders(ws, [], NOW);
  assert(started.ok, "整组规划可行并开工（香味/营养/保鲜均达标）");
  ws = started.ws;
  const order = ws.orders.find((o) => o.status === "running")!;
  const r = recipeOf("chum");
  // 按规划把每段投满
  r.groups.forEach((g, gi) => {
    let need = g.amount;
    for (const b of ws.ingredients) {
      if (need <= 0) break;
      if (g.alternatives.includes(b.kind) && b.qty > 0) {
        const use = Math.min(need, b.qty);
        ws = feedStage(ws, order.id, gi, b.id, use, NOW);
        need -= use;
      }
    }
  });
  assert(orderProgress(ws.orders[0]).ratio === 1, "全部料段投满");
  ws = completeOrder(ws, order.id, NOW);
  assert(ws.orders[0].status === "done", "订单完工");
  assert(ws.baitBatches.length === 1 && ws.batchLog.length === 1, "成品入盒并写入批次流水");
  const product = ws.baitBatches[0];
  assert(product.bait === "chum" && product.qty === 1, "成品种类与数量正确");
  assert(product.usedIngredients.length >= 3, "捕获手记可追溯实际配方与投料批次");
}

// ---- 场景 10：水域效果与库存 FIFO ----
console.log("场景10 特制饵水域扩散/偏好与到期 FIFO");
{
  let ws = emptyWorkshop();
  ws = syncResearch(ws, 99, NOW);
  ws = gainIngredient(ws, "cornmeal", 4, 2, NOW, "t");
  ws = gainIngredient(ws, "fishmeal", 2, 2, NOW, "t");
  ws = gainIngredient(ws, "moss", 4, 2, NOW, "t");
  ws = addOrder(ws, "paste", 2, NOW);
  ws = startOrders(ws, [], NOW).ws;
  const o = ws.orders[0];
  const r = recipeOf("paste");
  r.groups.forEach((g, gi) => {
    let need = g.amount * 2;
    for (const b of ws.ingredients) {
      if (need <= 0) break;
      if (g.alternatives.includes(b.kind) && b.qty > 0) {
        const use = Math.min(need, b.qty);
        ws = feedStage(ws, o.id, gi, b.id, use, NOW);
        need -= use;
      }
    }
  });
  ws = completeOrder(ws, o.id, NOW);
  // 再加一份短保鲜成品（模拟另一批次）
  const later = ws.baitBatches[0];
  const soon: typeof later = { ...later, id: "bait-soon", qty: 1, perishAt: NOW + 86400_000 };
  ws = { ...ws, baitBatches: [...ws.baitBatches, soon] };
  const first = consumeCraftBait(ws, "paste", NOW);
  assert(first.batch?.id === "bait-soon", "抛竿优先消耗最早到期批次（FIFO）");
  const stockAfter = craftStock(ws, NOW + 2 * 86400_000);
  assert((stockAfter.paste ?? 0) === 2, "过期批次不计入可用库存");
}

// ---- 场景 11：固定流程端到端（写入 allocation，其他单在余量中求解）----
console.log("场景11 固定用料写入与余量重算");
{
  const ingredients = [
    batch("f-corn", "cornmeal", 6, 9, 40, { protein: 1, carb: 8, fat: 1 }),
    batch("f-berry", "berry", 4, 6, 52, { protein: 0, carb: 7, fat: 1 }),
    batch("f-fishmeal", "fishmeal", 2, 7, 55, { protein: 8, carb: 0, fat: 2 }),
    batch("f-shrimp", "shrimp", 2, 6, 64, { protein: 7, carb: 1, fat: 1 }),
    batch("f-moss", "moss", 4, 8, 28, { protein: 2, carb: 4, fat: 0 }),
    batch("f-clay", "clay", 4, 12, 12, { protein: 0, carb: 2, fat: 0 }),
  ];
  const o1 = planningOrder(emptyWorkshop(), "paste", 1);
  const o2 = planningOrder(emptyWorkshop(), "paste", 1);
  const first = planGroup({ now: NOW, ingredients, orders: [o1, o2], pinned: [] });
  assert(first.allFeasible, "固定前两单均可行");
  const o1Alloc = first.orders.find((p) => p.orderId === o1.id)!.allocation;
  o1.allocation = { ...o1Alloc }; // 模拟 toggle-pin 写入
  const second = planGroup({ now: NOW, ingredients, orders: [o1, o2], pinned: [o1.id] });
  assert(second.allFeasible, "固定 o1 后 o2 仍在余量中求到解");
  const pinnedPlan = second.orders.find((p) => p.orderId === o1.id)!;
  assert(
    JSON.stringify(pinnedPlan.allocation) === JSON.stringify(o1Alloc),
    "固定单严格沿用写入的 allocation，不被重新选择",
  );
  // 固定单与自由单使用的同一批次数量之和不超过库存（无重复占用）
  const o2Plan = second.orders.find((p) => p.orderId === o2.id)!;
  for (const b of ingredients) {
    const used = (pinnedPlan.allocation[b.id] ?? 0) + (o2Plan.allocation[b.id] ?? 0);
    assert(used <= b.qty, `批次 ${b.kind} 未被超额占用（${used}/${b.qty}）`);
  }
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);
