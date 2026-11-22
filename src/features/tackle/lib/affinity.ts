import { fishCatalog } from "../../../shared/catalog";
import type { BaitId, SpotId } from "../../../shared/types";
import { recipes } from "../../workshop/model/catalog";

const CRAFTED: BaitId[] = ["paste", "chum"];

/** 特制鱼饵在某水域的扩散倍率（影响吸引权重） */
export function diffusionOf(bait: BaitId, spot: SpotId): number {
  if (!CRAFTED.includes(bait)) return 1;
  const recipe = recipes.find((r) => r.id === bait);
  return recipe?.effects[spot]?.diffusion ?? 1;
}

/** 特制鱼饵在某水域的咬饵偏好倍率（影响咬钩速度） */
export function preferenceOf(bait: BaitId, spot: SpotId): number {
  if (!CRAFTED.includes(bait)) return 1;
  const recipe = recipes.find((r) => r.id === bait);
  return recipe?.effects[spot]?.preference ?? 1;
}

export function attraction(spot: SpotId, bait: BaitId) {
  const diffusion = diffusionOf(bait, spot);
  return fishCatalog
    .filter((f) => f.waters.includes(spot))
    .map((f) => {
      // 特制饵对该水域所有鱼群都有吸引力，再叠加扩散倍率
      const matched = f.baits.includes(bait) || CRAFTED.includes(bait);
      const base = matched ? 5 : 1;
      const rarity =
        f.rarity === "稀有" ? 0.45 : f.rarity === "少见" ? 0.7 : 1;
      return { fish: f, weight: base * rarity * diffusion };
    });
}

export function biteDelay(bait: BaitId, roll: number, spot?: SpotId) {
  const base = bait === "worm" ? 1.8 : bait === "fly" ? 2.1 : 2.3;
  // 咬饵偏好越高，咬钩越快
  const pref = spot ? preferenceOf(bait, spot) : 1;
  return (base + roll * 2) / pref;
}
