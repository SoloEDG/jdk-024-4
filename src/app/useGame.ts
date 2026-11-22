import { useEffect, useReducer, useRef, useState } from "react";
import { idleSession } from "../shared/initial";
import { gameReducer } from "./gameReducer";
import { loadGame, saveGame } from "./storage";

/** 现实 1 秒对应游戏内 1 天，便于在演示中观察原料/成品到期 */
const GAME_MS_PER_REAL_SECOND = 86400_000;
/** localStorage 写入节流间隔（毫秒） */
const SAVE_THROTTLE = 1500;

export function useGame() {
  const loaded = useRef<ReturnType<typeof loadGame> | null>(null);
  if (!loaded.current) loaded.current = loadGame();
  const [state, send] = useReducer(gameReducer, loaded.current, (initial) => ({
    ...initial,
    session: idleSession(),
    pinned: [],
  }));
  const recovery = useRef(loaded.current.recovery === true);
  const [saved, setSaved] = useState(!recovery.current);
  const lastSave = useRef(0);
  const pending = useRef(false);

  // 存档写入：节流，页面隐藏/卸载时强制落盘
  useEffect(() => {
    if (recovery.current) return;
    pending.current = true;
    const now = Date.now();
    if (now - lastSave.current >= SAVE_THROTTLE) {
      lastSave.current = now;
      pending.current = false;
      setSaved(saveGame(state.doc));
    }
  }, [state.doc]);

  useEffect(() => {
    const flush = () => {
      if (recovery.current || !pending.current) return;
      pending.current = false;
      lastSave.current = Date.now();
      setSaved(saveGame(state.doc));
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [state.doc]);

  useEffect(() => {
    // 物理/垂钓 tick：50ms 步进，不写持久化时钟
    let previous = performance.now();
    let debt = 0;
    let frame = 0;
    const step = (now: number) => {
      if (!document.hidden) {
        debt += Math.min((now - previous) / 1000, 0.15);
        while (debt >= 0.05) {
          send({ type: "tick", dt: 0.05 });
          debt -= 0.05;
        }
      } else debt = 0;
      previous = now;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    // 游戏时钟：现实每秒推进游戏内 1 天，驱动到期与研究解锁
    const clockTimer = window.setInterval(() => {
      if (!document.hidden) send({ type: "clock", deltaMs: GAME_MS_PER_REAL_SECOND });
    }, 1000);

    const release = () => send({ type: "reel", held: false });
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(clockTimer);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
    };
  }, []);

  return { state, send, saved };
}
