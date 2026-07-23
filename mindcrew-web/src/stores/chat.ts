import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const isStreaming = ref(false)
  const currentSessionId = ref<string | null>(null)

  function addMessage(msg: ChatMessage) {
    messages.value.push(msg)
  }

  function clearMessages() {
    messages.value = []
  }

  function setStreaming(val: boolean) {
    isStreaming.value = val
  }

  function setSessionId(id: string) {
    currentSessionId.value = id
  }

  return {
    messages,
    isStreaming,
    currentSessionId,
    addMessage,
    clearMessages,
    setStreaming,
    setSessionId,
  }
})
