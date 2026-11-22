import type { Workspace } from "../shared/types";
import type { Command } from "../shared/commands";
import { idleSession, isBusy } from "../shared/initial";
import { selectWater } from "../features/waters";
import {
  chooseBait,
  tune,
  consumeBait,
  resupply,
  attraction,
  biteDelay,
  advanceClock,
} from "../features/tackle";
import { prepareCast, tickSession, strike } from "../features/fishing";
import { landCatch, releaseCatch } from "../features/collection";
import { claimReward } from "../features/challenges";
import { workshopCommand } from "../features/workshop";

export function gameReducer(state: Workspace, c: Command): Workspace {
  const { doc, session: s } = state;
  const busy = isBusy(s);
  switch (c.type) {
    case "spot":
      return busy ? state : { ...state, doc: selectWater(doc, c.id) };
    case "bait":
      return busy ? state : { ...state, doc: chooseBait(doc, c.id) };
    case "power":
      return { ...state, doc: tune(doc, "power", c.value) };
    case "drag":
      return busy ? state : { ...state, doc: tune(doc, "drag", c.value) };
    case "resupply":
      return busy
        ? state
        : {
            ...state,
            doc: resupply(doc),
            notice: "基础鱼饵已补给；工坊原料与成品不会被复制。",
          };
    case "charge-start":
      return s.phase === "ready" && doc.stock[doc.bait] + craftCount(doc, doc.bait) > 0
        ? {
            ...state,
            session: {
              ...idleSession(),
              phase: "charging",
              message: "再次点击，把鱼饵抛向水面。",
            },
          }
        : state;
    case "cast": {
      if (s.phase !== "charging") return state;
      const result = consumeBait(doc);
      if (!result) return state;
      const consumed = result.doc;
      const cast = prepareCast(
        consumed,
        s.charge,
        attraction(doc.spot, doc.bait),
        (r) => biteDelay(doc.bait, r, doc.spot),
        result.baitBatch?.id,
      );
      return {
        ...state,
        doc: {
          ...consumed,
          seed: cast.seed,
          stats: { ...doc.stats, casts: doc.stats.casts + 1 },
        },
        session: cast.session,
      };
    }
    case "strike":
      return { ...state, session: strike(s) };
    case "reel":
      return s.phase === "fighting"
        ? { ...state, session: { ...s, reeling: c.held } }
        : state;
    case "tick": {
      // 物理/垂钓状态推进；游戏时钟由独立的 clock 命令驱动，避免高频写库
      const next = tickSession(s, doc, Math.min(0.1, Math.max(0, c.dt)));
      if (next === s) return state;
      let updated = doc;
      if (next.phase === "landed" && s.phase !== "landed")
        updated = landCatch(doc, next, doc.clock);
      if (next.phase === "escaped" && s.phase !== "escaped")
        updated = {
          ...doc,
          stats: { ...doc.stats, escapes: doc.stats.escapes + 1 },
        };
      return { ...state, doc: updated, session: next };
    }
    case "clock": {
      // 按秒推进游戏内时钟，联动工坊过期清理与研究解锁
      const clocked = advanceClock(doc, c.deltaMs);
      return clocked === doc ? state : { ...state, doc: clocked };
    }
    case "next":
      return s.phase === "landed" || s.phase === "escaped"
        ? { ...state, session: idleSession() }
        : state;
    case "release":
      return { ...state, doc: releaseCatch(doc, c.id) };
    case "claim":
      return { ...state, doc: claimReward(doc, c.id) };
    default:
      // 工坊相关命令统一交给纯函数工坊 reducer（携带会话级固定清单）
      if (c.type.startsWith("workshop/")) {
        const result = workshopCommand(state, c, state.pinned);
        return result.notice
          ? { ...result.state, pinned: result.pinned, notice: result.notice }
          : { ...result.state, pinned: result.pinned };
      }
      return state;
  }
}

function craftCount(doc: Workspace["doc"], bait: string) {
  return doc.workshop.baitBatches
    .filter((b) => b.bait === bait && b.perishAt > doc.clock)
    .reduce((n, b) => n + b.qty, 0);
}
