import type {
  IngredientId,
  NutritionClass,
  Recipe,
} from "./types";

export interface IngredientInfo {
  id: IngredientId;
  name: string;
  icon: string;
  color: string;
  /** 捕获副产物 or 岸边采集物 */
  source: "副产物" | "采集物";
  nutrition: Record<NutritionClass, number>;
  /** 该种类的基准香味 */
  baseAroma: number;
  /** 基准保鲜时长（游戏内毫秒） */
  baseShelfLife: number;
  note: string;
}

/** 原料种类静态信息；具体批次的香味/保鲜会随品质浮动 */
export const ingredientCatalog: IngredientInfo[] = [
  {
    id: "fishmeal",
    name: "杂鱼粉",
    icon: "🐟",
    color: "#9c8268",
    source: "副产物",
    nutrition: { protein: 8, carb: 0, fat: 2 },
    baseAroma: 55,
    baseShelfLife: 6 * 86400_000,
    note: "小杂鱼磨制，蛋白扎实。",
  },
  {
    id: "fishoil",
    name: "浓鱼油",
    icon: "💧",
    color: "#c99b57",
    source: "副产物",
    nutrition: { protein: 1, carb: 0, fat: 9 },
    baseAroma: 78,
    baseShelfLife: 4 * 86400_000,
    note: "气味浓烈，扩散快但易变质。",
  },
  {
    id: "shrimp",
    name: "河虾碎",
    icon: "🦐",
    color: "#d98a7a",
    source: "副产物",
    nutrition: { protein: 7, carb: 1, fat: 1 },
    baseAroma: 64,
    baseShelfLife: 5 * 86400_000,
    note: "鲜甜，掠食鱼难以抗拒。",
  },
  {
    id: "cornmeal",
    name: "玉米碎",
    icon: "🌽",
    color: "#d4ac62",
    source: "采集物",
    nutrition: { protein: 1, carb: 8, fat: 1 },
    baseAroma: 40,
    baseShelfLife: 10 * 86400_000,
    note: "耐存放的碳水基底，留香温和。",
  },
  {
    id: "berry",
    name: "山浆果",
    icon: "🫐",
    color: "#7d6ea8",
    source: "采集物",
    nutrition: { protein: 0, carb: 7, fat: 1 },
    baseAroma: 52,
    baseShelfLife: 7 * 86400_000,
    note: "天然果糖，浅湾鱼群喜爱。",
  },
  {
    id: "moss",
    name: "清水苔",
    icon: "🌿",
    color: "#6d9f7a",
    source: "采集物",
    nutrition: { protein: 2, carb: 4, fat: 0 },
    baseAroma: 28,
    baseShelfLife: 8 * 86400_000,
    note: "清淡黏合，延长保鲜结构。",
  },
  {
    id: "insect",
    name: "草间飞虫",
    icon: "🪰",
    color: "#8a9158",
    source: "采集物",
    nutrition: { protein: 6, carb: 1, fat: 2 },
    baseAroma: 70,
    baseShelfLife: 5 * 86400_000,
    note: "高蛋白活香，溪流鱼的最爱。",
  },
  {
    id: "clay",
    name: "细湖泥",
    icon: "🟫",
    color: "#8b6f55",
    source: "采集物",
    nutrition: { protein: 0, carb: 2, fat: 0 },
    baseAroma: 12,
    baseShelfLife: 12 * 86400_000,
    note: "几乎无味，却能塑形并显著延长保鲜。",
  },
];

export function ingredientInfo(id: IngredientId): IngredientInfo {
  return ingredientCatalog.find((i) => i.id === id) ?? ingredientCatalog[0];
}

/**
 * 两份新配方（在 worm/corn/fly 之外）。
 * 营养比例、香味区间、最低保鲜期同时受限；原料组允许替代。
 */
export const recipes: Recipe[] = [
  {
    id: "paste",
    name: "醇香面饵",
    groups: [
      { amount: 2, alternatives: ["cornmeal", "berry"], label: "碳水基底" },
      { amount: 1, alternatives: ["fishmeal", "shrimp", "insect"], label: "蛋白添料" },
      { amount: 1, alternatives: ["moss", "clay"], label: "保水黏合" },
    ],
    nutritionRatio: {
      min: { protein: 0.18, carb: 0.4, fat: 0 },
      max: { protein: 0.5, carb: 0.85, fat: 0.28 },
    },
    aromaRange: [30, 62],
    minFreshness: 5 * 86400_000,
    researchRequired: 3,
    effects: {
      reed: { diffusion: 1.25, preference: 1.3 },
      deep: { diffusion: 1.1, preference: 1.05 },
      brook: { diffusion: 0.95, preference: 0.9 },
    },
    note: "素香为主，浅湾扩散广，锦鲤与银鲫尤其买账。",
  },
  {
    id: "chum",
    name: "浓腥窝饵",
    groups: [
      { amount: 2, alternatives: ["fishmeal", "shrimp"], label: "腥香主料" },
      { amount: 1, alternatives: ["fishoil", "insect"], label: "提腥添料" },
      { amount: 1, alternatives: ["clay", "moss"], label: "缓沉黏合" },
    ],
    nutritionRatio: {
      min: { protein: 0.45, carb: 0.05, fat: 0.12 },
      max: { protein: 0.85, carb: 0.35, fat: 0.5 },
    },
    aromaRange: [55, 85],
    minFreshness: 3 * 86400_000,
    researchRequired: 6,
    effects: {
      deep: { diffusion: 1.4, preference: 1.45 },
      brook: { diffusion: 1.2, preference: 1.2 },
      reed: { diffusion: 1.0, preference: 0.95 },
    },
    note: "高蛋浓腥，深水扩散迅猛，专诱大型掠食鱼。",
  },
];

export function recipeOf(id: string): Recipe {
  return recipes.find((r) => r.id === id) ?? recipes[0];
}
