import { defineStore } from 'pinia'

/**
 * 协作连接状态 Store
 *
 * 只维护一个布尔值 `connected`，用于 UI 提示当前 WebSocket 协作通道状态。
 *
 * 为什么拆成单独 store：
 * - WebSocket 生命周期在 util（collabSocket）里；
 * - 展示在多个页面组件（如 BookSidebar）里；
 * - 通过全局 store 共享最简单、解耦最好。
 */
export const useCollabStore = defineStore('collab', {
  state: () => ({
    connected: false
  }),
  actions: {
    setConnected(value) {
      this.connected = !!value
    }
  }
})
