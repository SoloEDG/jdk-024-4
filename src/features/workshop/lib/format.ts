import type { IngredientBatch, BaitBatch } from "../model/types";
import { ingredientInfo, recipeOf } from "../model/catalog";

/** 把游戏内毫秒偏移格式化为「x 天 x 小时」 */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "已到期";
  const day = 86400_000;
  const hour = 3600_000;
  const d = Math.floor(ms / day);
  const h = Math.floor((ms % day) / hour);
  if (d > 0) return `${d} 天 ${h} 小时`;
  const m = Math.floor((ms % hour) / 60000);
  return h > 0 ? `${h} 小时 ${m} 分` : `${m} 分`;
}

export function perishRemaining(b: IngredientBatch | BaitBatch, now: number) {
  return b.perishAt - now;
}

export function qualityStars(q: number): string {
  return "★".repeat(Math.round(q)) + "☆".repeat(3 - Math.round(q));
}

export function ingredientLabel(batch: IngredientBatch): string {
  return ingredientInfo(batch.kind).name;
}

export function percent(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export { recipeOf, ingredientInfo };
