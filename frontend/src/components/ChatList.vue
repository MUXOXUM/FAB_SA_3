<template>
  <div class="chat-list">
    <h5>Chats</h5>
    <button @click="showCreateChatModal = true" class="create-chat-btn">Create New Chat</button>
    <ul>
      <li v-for="chat in chats" :key="chat.id" 
          :class="{ active: chat.id === currentChatId, muted: isChatMuted(chat.id) }"
          @click="selectChat(chat.id)">
        <span class="chat-name">{{ chat.name }}</span>
        <button @click.stop="toggleMute(chat.id)" class="mute-btn">
          {{ isChatMuted(chat.id) ? '&#x1F515;' : '&#x1F514;' }} <!-- 🔕 / 🔔 -->
        </button>
      </li>
    </ul>
    <p v-if="!chats || chats.length === 0">No chats available.</p>

    <!-- Create Chat Modal -->
    <div v-if="showCreateChatModal" class="modal-overlay" @click.self="showCreateChatModal = false">
      <div class="modal-content">
        <h3>Create New Chat</h3>
        <form @submit.prevent="handleCreateChat">
          <div>
            <label for="chatName">Chat Name:</label>
            <input type="text" id="chatName" v-model="newChatName" required>
          </div>
          <div>
            <label for="chatUsers">Add Users (usernames separated by comma):</label>
            <input type="text" id="chatUsers" v-model="newChatUsernames" required>
          </div>
          <div v-if="createChatError" class="error-message">{{ createChatError }}</div>
          <button type="submit">Create Chat</button>
          <button type="button" @click="showCreateChatModal = false">Cancel</button>
        </form>
      </div>
    </div>

  </div>
</template>

<script>
export default {
  name: 'ChatList',
  props: {
    chats: {
      type: Array,
      required: true,
    },
    currentChatId: {
      type: String,
      default: null,
    }
  },
  data() {
    return {
      showCreateChatModal: false,
      newChatName: '',
      newChatUsernames: '',
      createChatError: null,
      mutedChatIds: new Set(), // For muted chat IDs
    };
  },
  created() {
    this.loadMutedChats();
  },
  methods: {
    loadMutedChats() {
      const muted = localStorage.getItem('mutedChatIds');
      if (muted) {
        this.mutedChatIds = new Set(JSON.parse(muted));
      }
    },
    saveMutedChats() {
      localStorage.setItem('mutedChatIds', JSON.stringify(Array.from(this.mutedChatIds)));
    },
    isChatMuted(chatId) {
      return this.mutedChatIds.has(chatId);
    },
    toggleMute(chatId) {
      if (this.mutedChatIds.has(chatId)) {
        this.mutedChatIds.delete(chatId);
      } else {
        this.mutedChatIds.add(chatId);
      }
      this.saveMutedChats();
      this.$emit('chatMuteToggled', { chatId, isMuted: this.isChatMuted(chatId) });
      // Force re-render if needed, though Vue should detect Set changes in methods for classes
      // For deep reactivity or explicit updates, consider Vue.set or forceUpdate in Vue 2.
      // In Vue 3, reactivity with Set should work fine when methods modifying it are called.
    },
    selectChat(chatId) {
      this.$emit('selectChat', chatId);
    },
    async handleCreateChat() {
      this.createChatError = null;
      if (!this.newChatName.trim() || !this.newChatUsernames.trim()) {
        this.createChatError = "Chat name and usernames are required.";
        return;
      }
      try {
        const usernames = this.newChatUsernames.split(',').map(name => name.trim()).filter(name => name);
        if (usernames.length === 0) {
          this.createChatError = "Please enter at least one username to add to the chat.";
          return;
        }

        // Emit an event to the parent component (e.g., App.vue or a main view)
        // to handle the actual API call.
        this.$emit('createChat', { name: this.newChatName, userUsernames: usernames });

        // Reset form and close modal on success (or handle this in parent after successful API call)
        this.newChatName = '';
        this.newChatUsernames = '';
        this.showCreateChatModal = false;
      } catch (error) {
        console.error('Error creating chat:', error);
        this.createChatError = error.response?.data?.message || 'Failed to create chat. Please try again.';
        // No need to close modal on error, user might want to correct input
      }
    }
  },
};
</script>

<style scoped>
.chat-list {
  background-color: #212121; /* Match chat-list-container background */
  color: #e0e0e0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.chat-list h5 {
  padding: 15px;
  margin: 0;
  background-color: #11180f; /* Darker green for header */
  color: #00ff7f; /* Bright green text */
  font-weight: bold;
  border-bottom: 1px solid #003311; /* Dark green border */
  text-transform: uppercase;
  letter-spacing: 1px;
}

.chat-list ul {
  list-style-type: none;
  padding: 0;
  margin: 0;
  flex-grow: 1;
  overflow-y: auto;
}

.chat-list li {
  padding: 12px 15px;
  cursor: pointer;
  border-bottom: 1px solid #2d2d2d; /* Darker separator */
  transition: background-color 0.2s ease;
  display: flex; /* Added for spacing button */
  justify-content: space-between; /* Added for spacing button */
  align-items: center; /* Added for spacing button */
}

.chat-list li:hover {
  background-color: #2c3e50; /* Slightly lighter, bluish dark on hover */
}

.chat-list li.active {
  background-color: #004d26; /* Dark green for active chat */
  color: #ffffff;
  font-weight: bold;
}

.chat-list li.muted .chat-name {
  color: #888; /* Grey out text for muted chats */
  font-style: italic;
}

.chat-list p {
    padding: 15px;
    text-align: center;
    color: #777;
}

.create-chat-btn {
  display: block;
  width: auto; /* Adjust width based on content */
  margin: 15px;
  padding: 12px 20px;
  background-color: #008040; /* Medium green */
  color: white;
  border: none;
  border-radius: 25px; /* More rounded for flat design */
  cursor: pointer;
  text-align: center;
  font-weight: bold;
  transition: background-color 0.2s ease;
  letter-spacing: 0.5px;
}

.create-chat-btn:hover {
  background-color: #006633; /* Darker green on hover */
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7); /* Darker overlay */
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background-color: #2c2c2c; /* Dark background for modal */
  padding: 25px;
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
  width: 90%;
  max-width: 450px;
  color: #e0e0e0; /* Light text */
}

.modal-content h3 {
  margin-top: 0;
  margin-bottom: 20px;
  color: #00ff7f; /* Bright green for modal title */
  text-align: center;
}

.modal-content form div {
  margin-bottom: 18px;
}

.modal-content label {
  display: block;
  margin-bottom: 8px;
  font-weight: bold;
  color: #bbb; /* Lighter grey for labels */
}

.modal-content input[type="text"] {
  width: calc(100% - 24px);
  padding: 12px;
  border: 1px solid #444; /* Darker border */
  border-radius: 4px;
  background-color: #333; /* Dark input background */
  color: #e0e0e0; /* Light input text */
}

.modal-content input[type="text"]:focus {
    border-color: #00ff7f; /* Green border on focus */
    outline: none;
}

.modal-content button {
  padding: 12px 20px;
  margin-right: 10px;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  font-weight: bold;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.modal-content button[type="submit"] {
  background-color: #00ff7f; /* Bright green for submit */
  color: #1a1a1a; /* Dark text on bright button */
}

.modal-content button[type="submit"]:hover {
  background-color: #00cc66; /* Slightly darker green */
}

.modal-content button[type="button"] {
  background-color: #555; /* Grey for cancel */
  color: #e0e0e0;
}

.modal-content button[type="button"]:hover {
  background-color: #444;
}

.error-message {
  color: #ff6b6b; /* A reddish pink for errors */
  margin-bottom: 15px;
  text-align: center;
  font-size: 0.9em;
}

/* Scrollbar styling for Webkit browsers */
.chat-list ul::-webkit-scrollbar {
  width: 8px;
}

.chat-list ul::-webkit-scrollbar-track {
  background: #212121; 
}

.chat-list ul::-webkit-scrollbar-thumb {
  background-color: #004d26; 
  border-radius: 4px;
}

.chat-list ul::-webkit-scrollbar-thumb:hover {
  background-color: #006633; 
}

.chat-list li .chat-name {
  flex-grow: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mute-btn {
  background: none;
  border: none;
  color: #aaa;
  cursor: pointer;
  font-size: 1.2em;
  padding: 0 5px;
  margin-left: 10px;
}

.mute-btn:hover {
  color: #00ff7f;
}
</style> 