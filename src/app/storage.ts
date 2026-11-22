import { newDocument } from "../shared/initial";
import { fishCatalog } from "../shared/catalog";
import type { GameDocument, BaitId } from "../shared/types";
import { emptyWorkshop, pruneExpired, syncResearch } from "../features/workshop/model/workshop";

const key = "stillwater-jdk024-v1";
const wallKey = "stillwater-jdk024-wallclock";
const spots = ["reed", "brook", "deep"];
const baits: BaitId[] = ["worm", "corn", "fly", "paste", "chum"];
/** 现实每 1 秒对应游戏内 1 天，与 useGame 的时钟速率保持一致 */
const GAME_MS_PER_REAL_MS = 86400_000 / 1000;

function isFiniteInt(n: unknown) {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}

/** 校验并补全工坊结构；非法则返回安全的空工坊，不凭空复制原料 */
function sanitizeWorkshop(raw: unknown): GameDocument["workshop"] {
  const fallback = emptyWorkshop();
  if (!raw || typeof raw !== "object") return fallback;
  const w = raw as GameDocument["workshop"];
  if (!Array.isArray(w.ingredients) || !Array.isArray(w.orders) ||
      !Array.isArray(w.baitBatches) || !Array.isArray(w.research) ||
      !Array.isArray(w.batchLog)) {
    return fallback;
  }
  const seqOk = isFiniteInt(w.seq) ? w.seq : fallback.seq;
  return {
    seq: seqOk,
    ingredients: w.ingredients.filter(
      (b) =>
        b &&
        typeof b.id === "string" &&
        typeof b.kind === "string" &&
        isFiniteInt(b.qty) &&
        isFiniteInt(b.perishAt) &&
        [1, 2, 3].includes(b.quality),
    ),
    orders: w.orders
      .filter((o) => o && typeof o.id === "string" && typeof o.recipeId === "string")
      .map((o) => ({
        ...o,
        // 刷新后进行中的单子保持原进度，不会重新占用一次原料
        status: o.status,
        allocation: o.allocation ?? {},
        stages: Array.isArray(o.stages) ? o.stages : [],
        mixed: o.mixed ?? {},
        mixedPerishAt: typeof o.mixedPerishAt === "number" ? o.mixedPerishAt : null,
      })),
    baitBatches: w.baitBatches.filter(
      (b) => b && typeof b.id === "string" && isFiniteInt(b.qty) && isFiniteInt(b.perishAt),
    ),
    batchLog: w.batchLog.filter((b) => b && typeof b.id === "string"),
    research: w.research.filter((r) => r && typeof r.recipeId === "string"),
  };
}

function valid(value: unknown): value is GameDocument {
  if (!value || typeof value !== "object") return false;
  const d = value as GameDocument;
  const fishIds = fishCatalog.map((f) => f.id);
  return (
    d.version === 1 &&
    spots.includes(d.spot) &&
    baits.includes(d.bait) &&
    Number.isFinite(d.power) &&
    d.power >= 0.15 &&
    d.power <= 0.95 &&
    Number.isFinite(d.drag) &&
    d.drag >= 0.15 &&
    d.drag <= 0.95 &&
    Number.isInteger(d.seed) &&
    !!d.stock &&
    baits.every((b) => isFiniteInt(d.stock[b])) &&
    !!d.stats &&
    ["casts", "catches", "escapes", "released"].every((k) => isFiniteInt(
      d.stats[k as keyof typeof d.stats],
    )) &&
    Array.isArray(d.claimed) &&
    d.claimed.every((c) => typeof c === "string") &&
    Array.isArray(d.bag) &&
    d.bag.every(
      (c) =>
        c &&
        typeof c.id === "string" &&
        fishIds.includes(c.fish) &&
        spots.includes(c.spot) &&
        baits.includes(c.bait) &&
        [c.weight, c.time, c.duration, c.peakTension].every(Number.isFinite),
    ) &&
    !!d.journal &&
    Object.entries(d.journal).every(
      ([id, e]) =>
        fishIds.includes(id as (typeof fishIds)[number]) &&
        e &&
        Number.isInteger(e.count) &&
        e.count > 0 &&
        Number.isFinite(e.best) &&
        Number.isFinite(e.first),
    ) &&
    !!d.workshop
  );
}

/** 旧版本存档迁移：补齐时钟与工坊字段，绝不复制已有原料 */
function migrate(parsed: Record<string, unknown>): GameDocument {
  const base = newDocument();
  const stock = (parsed.stock as GameDocument["stock"]) ?? base.stock;
  return {
    ...base,
    ...(parsed as Partial<GameDocument>),
    stock: {
      worm: stock.worm ?? 0,
      corn: stock.corn ?? 0,
      fly: stock.fly ?? 0,
      paste: stock.paste ?? 0,
      chum: stock.chum ?? 0,
    },
    clock: typeof parsed.clock === "number" ? (parsed.clock as number) : base.clock,
    workshop: sanitizeWorkshop(parsed.workshop),
  };
}

/** 离线追赶：按现实经过时间推进游戏时钟，使原料/成品到期在重开后依然连续 */
function catchUpOffline(doc: GameDocument): GameDocument {
  const wallRaw = localStorage.getItem(wallKey);
  if (!wallRaw) return doc;
  const lastWall = Number(wallRaw);
  if (!Number.isFinite(lastWall)) return doc;
  const elapsedReal = Date.now() - lastWall;
  if (elapsedReal <= 0) return doc;
  // 上限 12 小时现实时间，避免异常系统时钟造成跳跃
  const deltaGame = Math.min(elapsedReal, 12 * 3600 * 1000) * GAME_MS_PER_REAL_MS;
  const clock = doc.clock + deltaGame;
  const pruned = pruneExpired(doc.workshop, clock);
  const workshop = syncResearch(pruned, doc.stats.catches, clock);
  return { ...doc, clock, workshop };
}

export function loadGame(): { doc: GameDocument; notice: string; recovery?: true } {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { doc: newDocument(), notice: "" };
    const parsed: unknown = JSON.parse(raw);
    if (valid(parsed)) {
      // 即便整体有效，也对工坊做一次防御性清洗，并追赶离线时间
      const doc: GameDocument = catchUpOffline({
        ...parsed,
        workshop: sanitizeWorkshop(parsed.workshop),
      });
      return { doc, notice: "" };
    }
    // 旧存档（缺少工坊/时钟）尝试迁移
    if (parsed && typeof parsed === "object" && (parsed as GameDocument).version === 1) {
      return { doc: catchUpOffline(migrate(parsed as Record<string, unknown>)), notice: "" };
    }
    return {
      doc: newDocument(),
      notice: "本地手记格式或版本无法读取，已保留原手记并开启临时游玩。",
      recovery: true,
    };
  } catch {
    return {
      doc: newDocument(),
      notice: "无法读取本地手记，已暂停自动保存，本次可以临时游玩。",
      recovery: true,
    };
  }
}

export function saveGame(doc: GameDocument) {
  try {
    localStorage.setItem(key, JSON.stringify(doc));
    localStorage.setItem(wallKey, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}
