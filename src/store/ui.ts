import { create } from 'zustand'
import { UserRole } from '@/lib/types'

interface UIState {
  sidebarOpen: boolean
  activeModal: string | null
  activeCompanyId: string | null
  activeCompanyName: string | null
  userRole: UserRole | null
  setSidebarOpen: (open: boolean) => void
  openModal: (id: string) => void
  closeModal: () => void
  setActiveCompany: (id: string | null, name: string | null) => void
  setUserRole: (role: UserRole | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  activeModal: null,
  activeCompanyId: null,
  activeCompanyName: null,
  userRole: null,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  openModal: (id) => set({ activeModal: id }),
  closeModal: () => set({ activeModal: null }),
  setActiveCompany: (id, name) => set({ activeCompanyId: id, activeCompanyName: name }),
  setUserRole: (role) => set({ userRole: role }),
}))
