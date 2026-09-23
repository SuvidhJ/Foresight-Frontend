import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

export type Role = 'operator' | 'supervisor' | 'trainer'

/** localStorage can throw (private window, blocked storage); the app must work without it. */
const safeStorage: StateStorage = {
  getItem: (k) => { try { return localStorage.getItem(k) } catch { return null } },
  setItem: (k, v) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } },
  removeItem: (k) => { try { localStorage.removeItem(k) } catch { /* ignore */ } },
}

interface Session {
  operatorId: string
  role: Role
  tilted: boolean
  setOperator: (id: string) => void
  setRole: (r: Role) => void
  setTilted: (v: boolean) => void
}

export const useSession = create<Session>()(
  persist(
    (set) => ({
      operatorId: 'OP1001',
      role: 'operator',
      tilted: false,
      setOperator: (operatorId) => set({ operatorId }),
      setRole: (role) => set({ role }),
      setTilted: (tilted) => set({ tilted }),
    }),
    { name: 'foresight-session', storage: createJSONStorage(() => safeStorage), partialize: (s) => ({ operatorId: s.operatorId, role: s.role }) },
  ),
)

/** Audio needs one user gesture per page load, so this is never persisted. */
export const useAudioGate = create<{ unlocked: boolean; setUnlocked: () => void }>((set) => ({
  unlocked: false,
  setUnlocked: () => set({ unlocked: true }),
}))
