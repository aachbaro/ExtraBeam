import { createContext, useCallback, useContext, useRef, useState } from "react";

export type HistoryItem = {
  label: string;
  undoFn: () => Promise<void>;
  redoFn: () => Promise<void>;
};

export type UndoContextValue = { push: (item: HistoryItem) => void };

export const UndoContext = createContext<UndoContextValue>({ push: () => {} });

export function useUndo() {
  return useContext(UndoContext);
}

export function useUndoStack() {
  const pastRef = useRef<HistoryItem[]>([]);
  const futureRef = useRef<HistoryItem[]>([]);
  const [tick, setTick] = useState(0);
  const bump = () => setTick(n => n + 1);

  const push = useCallback((item: HistoryItem) => {
    pastRef.current = [...pastRef.current.slice(-49), item];
    futureRef.current = [];
    bump();
  }, []);

  async function undo() {
    const item = pastRef.current[pastRef.current.length - 1];
    if (!item) return;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [item, ...futureRef.current];
    bump();
    await item.undoFn();
  }

  async function redo() {
    const item = futureRef.current[0];
    if (!item) return;
    futureRef.current = futureRef.current.slice(1);
    pastRef.current = [...pastRef.current, item];
    bump();
    await item.redoFn();
  }

  void tick; // read so React tracks it; derived values below are re-evaluated after bump()
  return {
    contextValue: { push } as UndoContextValue,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    undoLabel: pastRef.current[pastRef.current.length - 1]?.label,
    redoLabel: futureRef.current[0]?.label,
  };
}
