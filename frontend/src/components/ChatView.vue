<template>
  <div class="chat-view">
    <div v-if="!currentChatId" class="no-chat-selected">
      <p>Select a chat to view messages or create a new one.</p>
    </div>
    <div v-else class="chat-content-wrapper">
      <div class="messages-container" ref="messagesContainer">
        <div v-if="isLoadingMessages" class="loading-messages">
          <p>Loading messages...</p>
        </div>
        <div v-else-if="messages.length === 0" class="no-messages">
          <p>No messages in this chat yet. Send one!</p>
        </div>
        <div v-for="message in messages" :key="message.id || message.timestamp" 
             :class="['message', { 'sent': message.senderId === currentUserId, 'received': message.senderId !== currentUserId }]">
          <span v-if="message.senderId !== currentUserId" class="message-sender">{{ getSenderUsername(message.senderId) }}:</span>
          <span class="message-text">{{ message.text }}</span>
          <span class="message-timestamp">{{ formatTimestamp(message.timestamp) }}</span>
        </div>
      </div>
      <form @submit.prevent="sendMessage" class="message-input-form">
        <input type="text" v-model="newMessageText" placeholder="Type a message..." :disabled="!currentChatId" />
        <button type="submit" :disabled="!newMessageText.trim() || !currentChatId">Send</button>
      </form>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ChatView',
  props: {
    messages: {
      type: Array,
      required: true,
    },
    currentChatId: {
      type: String,
      default: null,
    },
    currentUserId: { // Added to identify user's own messages
      type: String,
      default: null     // Allow null and default to null
    },
    chatParticipants: { // Added to display sender usernames
        type: Array,
        default: () => [] // Array of {id, username} objects
    },
    isLoadingMessages: {
        type: Boolean,
        default: false,
    }
  },
  data() {
    return {
      newMessageText: '',
    };
  },
  watch: {
    messages: {
      handler() {
        this.scrollToBottom();
      },
      deep: true
    },
    currentChatId() {
        this.newMessageText = ''; // Clear input when chat changes
        this.scrollToBottom(); // Also scroll when chat changes initially
    }
  },
  methods: {
    formatTimestamp(timestamp) {
      if (!timestamp) return '';
      return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    },
    sendMessage() {
      if (!this.newMessageText.trim() || !this.currentChatId) return;
      this.$emit('sendMessage', {
        text: this.newMessageText,
        chatId: this.currentChatId,
        // senderId will be added by the parent component or App.vue from the logged-in user's data
      });
      this.newMessageText = '';
      this.$nextTick(() => {
          this.scrollToBottom();
      });
    },
    getSenderUsername(senderId) {
        const participant = this.chatParticipants.find(p => p.id === senderId);
        return participant ? participant.username : 'Unknown User';
    },
    scrollToBottom(){
        this.$nextTick(() => {
            const container = this.$refs.messagesContainer;
            if(container){
                container.scrollTop = container.scrollHeight;
            }
        });
    }
  },
  mounted() {
      this.scrollToBottom();
  }
};
</script>

<style scoped>
.chat-view {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  background-color: #1a1a1a; /* Main dark background */
  color: #e0e0e0;
}

.no-chat-selected, .no-messages, .loading-messages {
  flex-grow: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: #777; /* Muted text for placeholders */
  padding: 20px;
  font-size: 1.1em;
}

.chat-content-wrapper {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.messages-container {
  flex-grow: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px; /* Spacing between messages */
}

/* Webkit Scrollbar Styles */
.messages-container::-webkit-scrollbar {
  width: 8px;
}

.messages-container::-webkit-scrollbar-track {
  background: #1a1a1a; /* Dark track */
}

.messages-container::-webkit-scrollbar-thumb {
  background-color: #004d26; /* Dark green thumb */
  border-radius: 4px;
}

.messages-container::-webkit-scrollbar-thumb:hover {
  background-color: #006633; /* Slightly lighter green on hover */
}

.message {
  padding: 10px 15px;
  border-radius: 12px; /* Softer, less circular than input */
  max-width: 75%;
  word-wrap: break-word;
  line-height: 1.5;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.message.sent {
  background-color: #006633; /* Darker, rich green for sent messages */
  color: #f0f0f0; /* Very light grey/white text for contrast */
  align-self: flex-end;
  border-bottom-right-radius: 4px; /* Flat edge */
}

.message.received {
  background-color: #2c2c2c; /* Dark grey for received messages */
  color: #e0e0e0;
  align-self: flex-start;
  border-bottom-left-radius: 4px; /* Flat edge */
}

.message-sender {
  font-weight: bold;
  display: block;
  font-size: 0.85em;
  color: #00b359; /* Lighter green for sender name on received messages */
  margin-bottom: 4px;
}

.message.sent .message-sender {
    display: none;
}

.message-text {
  font-size: 0.95em;
}

.message-timestamp {
  display: block;
  font-size: 0.7em;
  margin-top: 6px;
  text-align: right;
}

.message.sent .message-timestamp {
    color: #b0b0b0; /* Lighter grey for timestamp on sent messages */
}
.message.received .message-timestamp {
    color: #888; /* Darker grey for timestamp on received messages */
}

.message-input-form {
  display: flex;
  padding: 12px 15px;
  border-top: 1px solid #003311; /* Dark green border */
  background-color: #212121; /* Slightly lighter dark for input area */
  gap: 10px;
}

.message-input-form input {
  flex-grow: 1;
  padding: 12px 18px;
  border: 1px solid #333;
  border-radius: 25px; /* Fully rounded for a modern flat look */
  background-color: #2c2c2c; /* Dark input background */
  color: #e0e0e0;
  outline: none;
  font-size: 0.95em;
}

.message-input-form input:focus {
  border-color: #00ff7f; /* Bright green focus border */
  box-shadow: 0 0 0 2px rgba(0, 255, 127, 0.3);
}

.message-input-form button {
  padding: 12px 25px;
  background-color: #00ff7f; /* Bright green send button */
  color: #1a1a1a; /* Dark text for contrast */
  border: none;
  border-radius: 25px;
  cursor: pointer;
  font-weight: bold;
  transition: background-color 0.2s ease;
  letter-spacing: 0.5px;
}

.message-input-form button:disabled {
  background-color: #444; /* Darker grey for disabled button */
  color: #777;
  cursor: not-allowed;
}

.message-input-form button:hover:not(:disabled) {
  background-color: #00cc66; /* Slightly darker green on hover */
}
</style> 