import type { Workspace } from "../../../shared/types";
import type { Command } from "../../../shared/commands";
import type { CraftBaitId } from "./types";
import {
  addOrder,
  cancelOrder,
  completeOrder,
  feedStage,
  gainIngredient,
  removeOrder,
  startOrders,
} from "./workshop";

/**
 * 工坊命令 reducer：保持纯函数，不持有模块级可变状态。
 * 固定用料清单（pinned）由 UI 以命令参数形式传入，规划预览由 UI 用 useMemo 派生。
 */
export function workshopCommand(
  state: Workspace,
  c: Command,
  pinned: string[],
): { state: Workspace; pinned: string[]; notice?: string } {
  const { doc } = state;
  const ws = doc.workshop;
  switch (c.type) {
    case "workshop/gather": {
      const next = gainIngredient(
        ws,
        c.kind,
        c.qty,
        c.quality,
        doc.clock,
        "岸边采集",
      );
      return {
        state: { ...state, doc: { ...doc, workshop: next } },
        pinned,
        notice: `已采集 ${c.qty} 份原料，记得在到期前使用。`,
      };
    }
    case "workshop/add-order": {
      const next = addOrder(ws, c.recipeId as CraftBaitId, c.outputQty, doc.clock);
      if (next === ws)
        return { state, pinned, notice: "该配方尚未通过研究解锁。" };
      return {
        state: { ...state, doc: { ...doc, workshop: next } },
        pinned,
        notice: "已加入制作单，可在下方预览整组配料计划。",
      };
    }
    case "workshop/remove-order": {
      const next = removeOrder(ws, c.id);
      if (next === ws) return { state, pinned };
      return {
        state: { ...state, doc: { ...doc, workshop: next } },
        pinned: pinned.filter((id) => id !== c.id),
      };
    }
    case "workshop/toggle-pin": {
      const order = ws.orders.find((o) => o.id === c.id);
      if (!order || order.status !== "planning") return { state, pinned };
      const on = !pinned.includes(c.id);
      const nextPinned = on
        ? [...pinned, c.id]
        : pinned.filter((id) => id !== c.id);
      // 固定：把当前预览的该单分配写入订单；解除：清空固定分配
      const orders = ws.orders.map((o) => {
        if (o.id !== c.id) return o;
        return {
          ...o,
          allocation: on ? { ...(c.allocation ?? {}) } : {},
        };
      });
      return {
        state: { ...state, doc: { ...doc, workshop: { ...ws, orders } } },
        pinned: nextPinned,
        notice: on
          ? "已固定该单用料，将据此重算其他订单。"
          : "已解除该单固定，重新搜索全部订单。",
      };
    }
    case "workshop/start": {
      const result = startOrders(ws, pinned, doc.clock);
      if (!result.ok) {
        return {
          state,
          pinned,
          notice: result.plan.orders.length
            ? "开工核对未通过：预览期间库存可能已被抛竿消耗，请重新规划。"
            : "当前没有待开工的制作单。",
        };
      }
      return {
        state: { ...state, doc: { ...doc, workshop: result.ws } },
        pinned: [],
        notice: "整组计划核对通过，制作单已开工，可分段投料。",
      };
    }
    case "workshop/feed": {
      const next = feedStage(
        ws,
        c.orderId,
        c.stageIndex,
        c.batchId,
        c.amount,
        doc.clock,
      );
      if (next === ws)
        return { state, pinned, notice: "无法投料：原料不匹配、已过期或该段已满。" };
      return { state: { ...state, doc: { ...doc, workshop: next } }, pinned };
    }
    case "workshop/cancel": {
      const next = cancelOrder(ws, c.id);
      if (next === ws) return { state, pinned };
      return {
        state: { ...state, doc: { ...doc, workshop: next } },
        pinned,
        notice: "已取消制作单；进入混合料的部分不退，未投料原料保留在库存。",
      };
    }
    case "workshop/complete": {
      const next = completeOrder(ws, c.id, doc.clock);
      if (next === ws)
        return { state, pinned, notice: "尚未投满全部料段，无法完工。" };
      return {
        state: { ...state, doc: { ...doc, workshop: next } },
        pinned,
        notice: "特制鱼饵已入盒，实际配方与批次已记入捕获手记。",
      };
    }
    default:
      return { state, pinned };
  }
}
