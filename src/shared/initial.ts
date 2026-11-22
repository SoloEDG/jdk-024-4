import type { GameDocument, Session } from "./types";
import { emptyWorkshop, gainIngredient } from "../features/workshop/model/workshop";

/** 游戏内一天对应现实 6 分钟，方便在演示中观察到期 */
export const START_CLOCK = 0;

export function newDocument(): GameDocument {
  let workshop = emptyWorkshop();
  const now = START_CLOCK;
  // 起始原料：捕获副产物 + 岸边采集物，多批次、不同品质与到期时间
  workshop = gainIngredient(workshop, "cornmeal", 6, 2, now, "岸边采集");
  workshop = gainIngredient(workshop, "berry", 4, 1, now, "岸边采集");
  workshop = gainIngredient(workshop, "fishmeal", 5, 2, now, "捕获副产物");
  workshop = gainIngredient(workshop, "shrimp", 3, 3, now, "捕获副产物");
  workshop = gainIngredient(workshop, "moss", 4, 1, now, "岸边采集");
  workshop = gainIngredient(workshop, "clay", 5, 2, now, "岸边采集");
  workshop = gainIngredient(workshop, "fishoil", 2, 2, now, "捕获副产物");
  workshop = gainIngredient(workshop, "insect", 3, 2, now, "岸边采集");
  return {
    version: 1,
    spot: "reed",
    bait: "worm",
    power: 0.6,
    drag: 0.4,
    seed: 48127,
    stock: { worm: 24, corn: 20, fly: 16, paste: 0, chum: 0 },
    bag: [],
    journal: {},
    stats: { casts: 0, catches: 0, escapes: 0, released: 0 },
    claimed: [],
    clock: now,
    workshop,
  };
}
export function idleSession(): Session {
  return {
    id: "",
    phase: "ready",
    clock: 0,
    charge: 0,
    castPower: 0,
    spot: "reed",
    bait: "worm",
    fish: null,
    weight: 0,
    biteAt: 2,
    progress: 0,
    tension: 0.35,
    energy: 1,
    slackTime: 0,
    overload: 0,
    peak: 0,
    reeling: false,
    duration: 0,
    message: "深呼吸，把时间交给湖面。",
  };
}
export function isBusy(s: Session) {
  return ["charging", "waiting", "bite", "fighting"].includes(s.phase);
}
