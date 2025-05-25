<template>
  <div class="chat-page">
    <div class="chat-list-container">
      <div class="account-section">
        <button @click="toggleAccountDropdown" class="account-btn">
          👤 <!-- Account Icon -->
        </button>
        <div v-if="showAccountDropdown" class="account-dropdown">
          <div v-if="currentUserDetails">
            <p><strong>ID:</strong> {{ currentUserDetails.id }}</p>
            <p v-if="currentUserDetails.username"><strong>Username:</strong> {{ currentUserDetails.username }}</p>
          </div>
          <button @click="logout" class="logout-btn">Logout</button>
        </div>
      </div>
      <ChatList 
        :chats="chatList" 
        :currentChatId="selectedChatId" 
        @selectChat="handleSelectChat" 
        @createChat="handleCreateChat"
        @chatMuteToggled="handleChatMuteToggled" />
    </div>
    <div class="chat-view-container">
      <ChatView 
        :messages="currentChatMessages" 
        :currentChatId="selectedChatId" 
        :currentUserId="currentUserId" 
        :chatParticipants="currentChatParticipants" 
        :isLoadingMessages="isLoadingMessages"
        @sendMessage="handleSendMessage" 
        @toggleReaction="handleToggleReaction" />
    </div>
  </div>
</template>

<script>
import io from 'socket.io-client';
import ChatList from '@/components/ChatList.vue';
import ChatView from '@/components/ChatView.vue';
// import Vue from 'vue'; // Not needed for Vue 3 with composition API style reactivity updates

export default {
  name: 'ChatPage',
  components: {
    ChatList,
    ChatView,
  },
  data() {
    return {
      socket: null,
      allMessagesByChat: {}, // Store messages per chat: { chatId1: [msg1, msg2], chatId2: [...] }
      chatList: [], 
      selectedChatId: null, 
      currentUserId: null, 
      currentUserDetails: null, // To store more details like username
      currentChatParticipants: [], 
      isLoadingMessages: false,
      mutedChatIds: new Set(), // To store IDs of muted chats
      showAccountDropdown: false, // For account dropdown visibility
    };
  },
  computed: {
    currentChatMessages() {
      if (!this.selectedChatId || !this.allMessagesByChat[this.selectedChatId]) {
        return [];
      }
      // Return a sorted copy of messages by timestamp
      return [...this.allMessagesByChat[this.selectedChatId]].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }
  },
  methods: {
    decodeToken() {
      const token = localStorage.getItem('authToken');
      if (token) {
        try {
          const base64Url = token.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
              return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          }).join(''));
          const decodedToken = JSON.parse(jsonPayload);
          this.currentUserId = decodedToken.id;
          this.currentUserDetails = { id: decodedToken.id, username: decodedToken.username }; // Store ID and username
        } catch (e) {
          console.error('Error decoding token:', e);
          this.currentUserId = null;
          this.currentUserDetails = null;
        }
      } else {
        console.warn('Auth token not found. User ID cannot be set.');
        this.currentUserDetails = null;
      }
    },

    toggleAccountDropdown() {
      this.showAccountDropdown = !this.showAccountDropdown;
    },

    logout() {
      console.log('Logging out...');
      localStorage.removeItem('authToken');
      localStorage.removeItem('mutedChatIds'); // Clear muted chats preference on logout
      this.currentUserId = null;
      this.currentUserDetails = null;
      this.chatList = [];
      this.allMessagesByChat = {};
      this.selectedChatId = null;
      this.mutedChatIds = new Set();
      if (this.socket) {
        this.socket.disconnect();
      }
      this.$router.push('/login');
    },

    playNotificationSound() {
      // Check if the current selected chat is muted
      if (this.selectedChatId && this.mutedChatIds.has(this.selectedChatId)) {
        console.log(`Chat ${this.selectedChatId} is muted. Suppressing notification sound.`);
        return; 
      }
      const audio = new Audio('/notification.mp3'); // Assumes notification.mp3 is in /public
      audio.play().catch(error => console.warn("Error playing notification sound:", error));
    },

    loadMutedChatsFromStorage() { // Renamed to avoid conflict with ChatList's method if ever mixed
      const muted = localStorage.getItem('mutedChatIds');
      if (muted) {
        this.mutedChatIds = new Set(JSON.parse(muted));
        console.log('ChatPage: Loaded muted chats from localStorage:', Array.from(this.mutedChatIds));
      }
    },

    handleSelectChat(chatId) {
      if (this.selectedChatId === chatId && this.allMessagesByChat[chatId]) return; // Avoid re-joining/re-loading if already selected and messages loaded

      if (this.selectedChatId && this.socket && this.socket.connected) {
        this.socket.emit('leave_chat', this.selectedChatId);
        console.log(`Left chat room: ${this.selectedChatId}`);
      }
      
      this.selectedChatId = chatId;
      this.isLoadingMessages = true;
      // Initialize message array for the chat if it doesn't exist
      if (!this.allMessagesByChat[chatId]) {
        this.allMessagesByChat = {
          ...this.allMessagesByChat,
          [chatId]: []
        };
      }

      const selectedChat = this.chatList.find(chat => chat.id === chatId);
      if (selectedChat) {
        if (selectedChat.participants && selectedChat.participantUsernames && selectedChat.participants.length === selectedChat.participantUsernames.length) {
            this.currentChatParticipants = selectedChat.participants.map((id, index) => ({
                id: id,
                username: selectedChat.participantUsernames[index]
            }));
        } else {
            this.currentChatParticipants = selectedChat.participants?.map(id => ({id, username: `User ${id.substring(0,4)}`})) || [];
            console.warn("Participant username details might be incomplete for ChatView for chat:", chatId);
        }
      } else {
        this.currentChatParticipants = [];
        console.warn("Selected chat not found in chatList:", chatId);
      }

      if (this.socket && this.socket.connected) {
        this.socket.emit('join_chat', chatId);
        console.log(`Requested to join chat room: ${chatId}`);
      } else {
        console.error("Socket not connected, cannot join chat. Will attempt to join on connect.");
        // isLoading will be reset by load_messages or if socket fails to connect and join
      }
    },

    handleCreateChat(chatDetails) {
      console.log('Attempting to create chat:', chatDetails);
      const token = localStorage.getItem('authToken');
      fetch('http://localhost:3000/api/chats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(chatDetails),
      })
      .then(response => {
        if (!response.ok) {
          return response.json().then(err => { throw new Error(err.message || 'Failed to create chat'); });
        }
        return response.json();
      })
      .then(newChat => {
        console.log('Chat created:', newChat);
        this.chatList.push(newChat);
        this.handleSelectChat(newChat.id); // Select and join the new chat
      })
      .catch(error => {
        console.error('Error creating chat:', error.message);
        alert(`Error creating chat: ${error.message}`);
      });
    },

    handleSendMessage(messageData) {
      if (!this.currentUserId) {
        console.error('Cannot send message, currentUserId is not set.');
        alert('Error: User not identified. Please log in again.');
        return;
      }

      // Updated validation: chat_id must exist.
      // If it's a text message, text must be non-empty.
      // If it's a file message (image/video), url must exist.
      if (!messageData.chatId) {
        console.error('Cannot send message, chatId is missing.', messageData);
        return;
      }

      if (messageData.type === 'text') {
        if (!messageData.text || !messageData.text.trim()) {
          console.warn('Attempted to send an empty text message.');
          return;
        }
      } else if (messageData.type === 'image' || messageData.type === 'video') {
        if (!messageData.url) {
          console.error('Cannot send file message, URL is missing.', messageData);
          return;
        }
      } else {
        // Should not happen if ChatView emits correctly
        console.error('Unknown message type or type missing:', messageData);
        return;
      }
      
      if (!this.socket || !this.socket.connected) {
        console.error('Socket not connected. Cannot send message.');
        alert('Not connected to chat server. Please check your connection.');
        return;
      }

      const messageToSend = {
        ...messageData,
        senderId: this.currentUserId, 
        timestamp: new Date().toISOString(),
      };
      this.socket.emit('send_message', messageToSend);
    },

    fetchChats() {
        const token = localStorage.getItem('authToken');
        if (!token) {
            console.warn("No auth token found, cannot fetch chats.");
            // Potentially redirect to login or show an error message
            return Promise.reject("No auth token");
        }
        this.isLoadingMessages = true; // Indicate loading for initial chat/message load
        return fetch('http://localhost:3000/api/chats', {
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch chats');
            }
            return response.json();
        })
        .then(chats => {
            this.chatList = chats;
            if (chats.length > 0 && !this.selectedChatId) {
                this.handleSelectChat(chats[0].id); // Auto-select and join first chat
            } else {
                this.isLoadingMessages = false; // No chats or one already selected, stop loading indicator
            }
        })
        .catch(error => {
            console.error('Error fetching chats:', error);
            alert('Error fetching your chats. Please try again later.');
            this.isLoadingMessages = false;
        });
    },

    handleToggleReaction(reactionData) {
      console.log('ChatPage: handleToggleReaction received:', reactionData);
      if (!this.currentUserId || !this.selectedChatId) {
        console.error('ChatPage: User or chat not identified for reaction. currentUserId:', this.currentUserId, 'selectedChatId:', this.selectedChatId);
        return;
      }
      if (!this.socket || !this.socket.connected) {
        console.error('ChatPage: Socket not connected. Cannot send reaction.');
        alert('Not connected to chat server. Please check your connection to react.');
        return;
      }
      const payload = {
        ...reactionData, // { messageId, reactionEmoji }
        userId: this.currentUserId,
        chatId: this.selectedChatId 
      };
      console.log('ChatPage: Emitting toggle_reaction to server with payload:', payload);
      this.socket.emit('toggle_reaction', payload);
    },

    handleChatMuteToggled({ chatId, isMuted }) {
      if (isMuted) {
        this.mutedChatIds.add(chatId);
      } else {
        this.mutedChatIds.delete(chatId);
      }
      // Optionally, re-save to ChatPage's localStorage if you want redundancy,
      // but ChatList already handles persistence. Here, we just update the reactive state.
      console.log(`ChatPage: Mute status for chat ${chatId} updated to ${isMuted}. Muted chats:`, Array.from(this.mutedChatIds));
    },

    setupSocketListeners() {
        if (!this.socket) return;

        this.socket.on('connect', () => {
          console.log('Connected to WebSocket server:', this.socket.id, 'for user:', this.currentUserId);
          // If a chat was selected before socket connected (e.g. from fetchChats), join it.
          if (this.selectedChatId) {
            this.socket.emit('join_chat', this.selectedChatId);
            console.log(`Re-requested to join chat room after connect: ${this.selectedChatId}`);
          } else if (this.chatList.length > 0) {
            // If no chat was selected but chats are loaded, select and join the first one.
            this.handleSelectChat(this.chatList[0].id);
          }
        });

        this.socket.on('load_messages', (data) => {
          console.log(`Received load_messages for chat ${data.chatId}:`, data.messages);
          const sortedMessages = [...data.messages].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          this.allMessagesByChat = {
            ...this.allMessagesByChat,
            [data.chatId]: sortedMessages
          };
          this.isLoadingMessages = false;
        });

        this.socket.on('receive_message', (newMessage) => {
          console.log('Received new message:', newMessage);
          const { chatId, senderId } = newMessage; // Destructure senderId
          const existingMessages = this.allMessagesByChat[chatId] ? [...this.allMessagesByChat[chatId]] : [];
          
          // Avoid duplicates if message somehow already exists (e.g. sent by self and echoed)
          if (!existingMessages.find(msg => msg.id === newMessage.id)) {
            const updatedMessages = [...existingMessages, newMessage].sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
            this.allMessagesByChat = {
              ...this.allMessagesByChat,
              [chatId]: updatedMessages
            };

            // Play sound notification if message is from another user and chat is selected
            if (senderId !== this.currentUserId && chatId === this.selectedChatId) {
              this.playNotificationSound();
            }
          }
        });

        // New listener for reaction updates
        this.socket.on('message_reaction_updated', (data) => {
          const { messageId, reactions } = data;
          if (!this.selectedChatId || !this.allMessagesByChat[this.selectedChatId]) {
            console.warn('Received reaction update for a chat that is not active or has no messages loaded locally.', data);
            return;
          }
          
          const messageIndex = this.allMessagesByChat[this.selectedChatId].findIndex(m => m.id === messageId);
          if (messageIndex > -1) {
            // Create a new object for the message to ensure reactivity for nested `reactions`
            const updatedMessage = {
              ...this.allMessagesByChat[this.selectedChatId][messageIndex],
              reactions: reactions || {} // Ensure reactions is an object
            };
            
            // Create a new array for the chat messages to ensure reactivity of the list
            const updatedChatMessages = [...this.allMessagesByChat[this.selectedChatId]];
            updatedChatMessages[messageIndex] = updatedMessage;

            this.allMessagesByChat = {
              ...this.allMessagesByChat,
              [this.selectedChatId]: updatedChatMessages
            };
            console.log('Reaction updated for message:', messageId, 'New reactions:', reactions);
          } else {
            console.warn('Received reaction update for a message not found locally:', messageId);
          }
        });

        this.socket.on('disconnect', () => {
          console.log('Disconnected from WebSocket server');
        });

        this.socket.on('connect_error', (err) => {
            console.error("Socket connection error:", err.message);
            alert("Could not connect to chat server. Please check your connection or try again later.");
            this.isLoadingMessages = false;
        });
    }
  },
  async created() {
    this.decodeToken();
    this.loadMutedChatsFromStorage(); // Load muted status
    if (this.currentUserId) {
        await this.fetchChats(); // Wait for chats to be fetched before setting up socket
        this.socket = io('http://localhost:3000', {
            query: { userId: this.currentUserId } 
        });
        this.setupSocketListeners();
    } else {
        console.error("User ID not available, chat functionality disabled.");
        alert("You are not logged in. Please log in to use the chat.");
        // Consider redirecting to login page: this.$router.push('/login');
    }
  },
  beforeUnmount() {
    if (this.socket) {
      if (this.selectedChatId) {
        this.socket.emit('leave_chat', this.selectedChatId);
      }
      this.socket.disconnect();
    }
  },
};
</script>

<style scoped>
.chat-page {
  display: flex;
  height: 100vh;
  background-color: #1a1a1a; /* Dark background */
  color: #e0e0e0; /* Light text for readability */
}

.chat-list-container {
  width: 280px; /* Fixed width for chat list */
  background-color: #212121; /* Slightly lighter dark shade for distinction */
  border-right: 1px solid #003311; /* Dark green border */
  display: flex;
  flex-direction: column;
  position: relative; /* For positioning account dropdown */
}

.account-section {
  padding: 10px;
  background-color: #11180f; /* Match ChatList header */
  border-bottom: 1px solid #003311; /* Match ChatList header border */
  text-align: left;
}

.account-btn {
  background: none;
  border: none;
  color: #00ff7f; /* Bright green */
  font-size: 1.5em; /* Larger icon */
  cursor: pointer;
  padding: 5px;
}

.account-btn:hover {
  color: #ffffff;
}

.account-dropdown {
  position: absolute;
  top: 50px; /* Adjust as needed based on account-btn height and padding */
  left: 10px;
  background-color: #2c3e50; /* Dark, slightly bluish */
  border: 1px solid #00ff7f;
  border-radius: 4px;
  padding: 15px;
  z-index: 1001; /* Above chat list items */
  min-width: 200px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
}

.account-dropdown p {
  margin: 0 0 10px 0;
  font-size: 0.9em;
  color: #e0e0e0;
}
.account-dropdown p strong {
  color: #00ff7f;
}

.logout-btn {
  background-color: #c0392b; /* Reddish color for logout */
  color: white;
  border: none;
  padding: 8px 15px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  display: block;
  width: 100%;
  text-align: center;
  transition: background-color 0.2s ease;
}

.logout-btn:hover {
  background-color: #a93226; /* Darker red on hover */
}

.chat-view-container {
  flex-grow: 1; /* Takes remaining width */
  display: flex;
  flex-direction: column;
  overflow-y: auto; /* Allows ChatView to scroll if its content overflows */
}
</style>