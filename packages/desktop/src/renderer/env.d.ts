import type { ElectronAPI } from "../preload/types"

declare global {
  interface Window {
    api: ElectronAPI
    __MIMOCODE__?: {
      deepLinks?: string[]
    }
  }
}
