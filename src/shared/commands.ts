import type { BaitId, SpotId } from "./types";
import type { IngredientId, Quality } from "../features/workshop/model/types";

export type Command =
  | { type: "spot"; id: SpotId }
  | { type: "bait"; id: BaitId }
  | { type: "power"; value: number }
  | { type: "drag"; value: number }
  | { type: "charge-start" }
  | { type: "cast" }
  | { type: "strike" }
  | { type: "reel"; held: boolean }
  | { type: "tick"; dt: number }
  | { type: "clock"; deltaMs: number }
  | { type: "next" }
  | { type: "release"; id: string }
  | { type: "claim"; id: string }
  | { type: "resupply" }
  // 工坊：采集原料
  | { type: "workshop/gather"; kind: IngredientId; qty: number; quality: Quality }
  // 工坊：建单 / 删单
  | { type: "workshop/add-order"; recipeId: string; outputQty: number }
  | { type: "workshop/remove-order"; id: string }
  // 工坊：固定 / 解除固定某单用料（固定时携带当前预览分配写入该单）
  | { type: "workshop/toggle-pin"; id: string; allocation?: Record<string, number> }
  // 工坊：开工（重新核对整组可行性）
  | { type: "workshop/start" }
  // 工坊：分段投料
  | {
      type: "workshop/feed";
      orderId: string;
      stageIndex: number;
      batchId: string;
      amount: number;
    }
  // 工坊：取消（只退未用）/ 完工
  | { type: "workshop/cancel"; id: string }
  | { type: "workshop/complete"; id: string };
