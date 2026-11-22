import type { BaitId, SpotId } from "../../../shared/types";

/** 原料种类：捕获副产物 + 岸边采集物 */
export type IngredientId =
  | "fishmeal" // 磨碎的杂鱼（捕获副产物）
  | "fishoil" // 鱼油（捕获副产物）
  | "shrimp" // 小虾（捕获副产物）
  | "cornmeal" // 玉米碎（岸边采集）
  | "berry" // 野莓（岸边采集）
  | "moss" // 水苔（岸边采集）
  | "insect" // 草间飞虫（岸边采集）
  | "clay"; // 湖泥（岸边采集）

/** 营养分类，用于约束营养比例 */
export type NutritionClass = "protein" | "carb" | "fat";

/** 原料品质，影响成品保鲜与香味 */
export type Quality = 1 | 2 | 3;

/** 可在工坊制作的特制鱼饵 */
export type CraftBaitId = Exclude<BaitId, "worm" | "corn" | "fly">;

/**
 * 一份原料（按批次管理）。
 * 每份原料都有独立数量、成分、品质与到期时间。
 */
export interface IngredientBatch {
  id: string;
  kind: IngredientId;
  /** 该批次剩余可用份数 */
  qty: number;
  /** 每份的营养构成（蛋白 / 碳水 / 脂肪），单位 g */
  nutrition: Record<NutritionClass, number>;
  /** 每份香味强度（0-100） */
  aroma: number;
  quality: Quality;
  /** 到期时间戳（游戏内毫秒），到期后不可再用于制作 */
  perishAt: number;
  /** 来源描述，用于手记追溯 */
  origin: string;
}

/** 配方允许的替代原料组：组内任一原料均可替代 */
export interface IngredientGroup {
  /** 该组需要的总份数 */
  amount: number;
  /** 可接受的原料种类（替代关系） */
  alternatives: IngredientId[];
  label: string;
}

/** 成品在某一水域的实际效果 */
export interface WaterEffect {
  /** 扩散范围倍率，影响吸引到鱼的权重 */
  diffusion: number;
  /** 咬饵偏好倍率，影响咬钩速度 */
  preference: number;
}

/** 特制鱼饵配方 */
export interface Recipe {
  id: CraftBaitId;
  name: string;
  /** 原料组（含替代原料） */
  groups: IngredientGroup[];
  /** 营养比例约束：各营养占比允许区间，和为 1 */
  nutritionRatio: {
    min: Record<NutritionClass, number>;
    max: Record<NutritionClass, number>;
  };
  /** 香味强度允许区间 */
  aromaRange: [number, number];
  /** 成品最低保鲜期（游戏内毫秒） */
  minFreshness: number;
  /** 研究解锁所需的累计捕获数 */
  researchRequired: number;
  /** 各水域扩散与咬饵偏好基准效果 */
  effects: Partial<Record<SpotId, WaterEffect>>;
  note: string;
}

/** 制作单状态 */
export type OrderStatus = "planning" | "running" | "done" | "cancelled";

/** 制作单分段进度（开工后按段消耗原料，刷新不重复占用） */
export interface OrderStage {
  /** 该段需要的总投料份数 */
  need: number;
  /** 该段已投料份数 */
  fed: number;
}

/** 某批次进入混合料的投料快照（批次耗尽移除后仍可追溯） */
export interface MixedPortion {
  batchId: string;
  kind: IngredientId;
  amount: number;
  quality: Quality;
  perishAt: number;
}

/** 一张制作单 */
export interface CraftOrder {
  id: string;
  recipeId: CraftBaitId;
  /** 计划产出份数 */
  outputQty: number;
  status: OrderStatus;
  /** 已确认/固定的配料计划：原料批次 id -> 使用份数 */
  allocation: Record<string, number>;
  /** 分段进度（按原料组拆段） */
  stages: OrderStage[];
  /** 已投料混合料（含批次快照，取消只退未用部分、完工可追溯） */
  mixed: Record<string, MixedPortion>;
  /** 混合料的保鲜期限：取最早投料批次到期时间，重新混合不能延长 */
  mixedPerishAt: number | null;
  createdAt: number;
}

/** 成品特制鱼饵批次（带独立到期时间与来源追溯） */
export interface BaitBatch {
  id: string;
  bait: CraftBaitId;
  qty: number;
  /** 成品到期时间（游戏内毫秒） */
  perishAt: number;
  /** 实际用掉的配方与批次，写入捕获手记可追溯 */
  recipeId: CraftBaitId;
  usedAllocation: Record<string, number>;
  /** 实际投料的原料种类快照（批次耗尽/订单删除后仍可追溯） */
  usedIngredients: { batchId: string; kind: IngredientId; amount: number }[];
  /** 平均品质（用于显示） */
  quality: number;
  createdAt: number;
}

/** 研究解锁记录（可追溯） */
export interface ResearchRecord {
  recipeId: CraftBaitId;
  unlockedAt: number;
  /** 解锁时累计捕获数 */
  catchesAtUnlock: number;
}

/** 工坊全部持久化状态 */
export interface WorkshopState {
  ingredients: IngredientBatch[];
  orders: CraftOrder[];
  baitBatches: BaitBatch[];
  research: ResearchRecord[];
  /** 已完成的成品批次流水（捕获手记的配方追溯来源） */
  batchLog: BaitBatch[];
  /** 单调递增的序号，保证刷新后 id 不重复、不复制 */
  seq: number;
}

/** 规划中的一条配料行（某个订单分配给某个原料批次） */
export interface PlanLine {
  orderId: string;
  batchId: string;
  kind: IngredientId;
  amount: number;
}

/** 单个订单的规划结果 */
export interface OrderPlan {
  orderId: string;
  recipeId: CraftBaitId;
  /** 该订单的配料分配：批次 id -> 份数 */
  allocation: Record<string, number>;
  feasible: boolean;
  /** 不可行时的缺口说明（按原料组） */
  gaps: string[];
  /** 预计成品保鲜期 */
  expectedFreshness: number;
  /** 预计混合香味 */
  expectedAroma: number;
  /** 预计营养比例 */
  expectedRatio: Record<NutritionClass, number>;
}

/** 整组多单规划结果 */
export interface GroupPlan {
  orders: OrderPlan[];
  /** 规划完成后剩余原料：批次 id -> 剩余份数 */
  leftovers: Record<string, number>;
  /** 整组是否全部可行 */
  allFeasible: boolean;
  /** 搜索是否完整结束（未结束不得宣称缺料） */
  exhausted: boolean;
  /** 被固定用料的订单 id 列表 */
  pinned: string[];
}
