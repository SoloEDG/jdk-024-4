import { useMemo } from "react";
import type { GameDocument } from "../../../shared/types";
import { planGroup } from "./planner";
import type { GroupPlan } from "../model/types";

const EMPTY: GroupPlan = {
  orders: [],
  leftovers: {},
  allFeasible: false,
  exhausted: true,
  pinned: [],
};

/**
 * 纯派生整组配料计划：输入库存、规划中订单与固定清单，输出共存方案。
 * 不写入任何持久化数据，可在渲染期安全调用（useMemo 缓存）。
 */
export function useWorkshopPlan(
  doc: GameDocument,
  pinned: string[],
): GroupPlan {
  return useMemo(() => {
    const planning = doc.workshop.orders.filter((o) => o.status === "planning");
    if (planning.length === 0) return EMPTY;
    const activePinned = pinned.filter((id) =>
      planning.some((o) => o.id === id),
    );
    return planGroup({
      now: doc.clock,
      ingredients: doc.workshop.ingredients,
      orders: planning,
      pinned: activePinned,
    });
  }, [doc.clock, doc.workshop.ingredients, doc.workshop.orders, pinned]);
}
