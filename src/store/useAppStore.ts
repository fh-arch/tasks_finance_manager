import { create } from 'zustand'
import type { Profile } from '@/types'

interface AppStore {
  profile: Profile | null
  setProfile: (p: Profile | null) => void
}

export const useAppStore = create<AppStore>((set) => ({
  profile: null,
  setProfile: (p) => set({ profile: p }),
}))
