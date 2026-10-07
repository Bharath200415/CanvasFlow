import { create } from "zustand";

interface historyState {
  canUndo: boolean;
  canRedo: boolean;
}

const useHistory = create<historyState>()(() => ({
  canUndo: false,
  canRedo: false,
}));

export { useHistory };
