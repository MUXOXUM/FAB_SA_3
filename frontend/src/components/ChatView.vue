<template>
  <div class="chat-view">
    <div v-if="!currentChatId" class="no-chat-selected">
      <p>Select a chat to view messages or create a new one.</p>
    </div>
    <div v-else class="chat-content-wrapper">
      <!-- Search Bar -->
      <div class="message-search-bar">
        <input 
          type="text" 
          v-model="searchTerm" 
          placeholder="Search messages..." 
          class="search-input"
        />
        <button v-if="searchTerm" @click="clearSearch" class="clear-search-btn">✖</button>
      </div>

      <div class="messages-container" ref="messagesContainer">
        <div v-if="isLoadingMessages" class="loading-messages">
          <p>Loading messages...</p>
        </div>
        <div v-else-if="displayedMessages.length === 0 && !uploadingFile && !searchTerm" class="no-messages">
          <p>No messages in this chat yet. Send one or share a file!</p>
        </div>
        <div v-else-if="displayedMessages.length === 0 && searchTerm" class="no-messages">
          <p>No messages found matching "{{ searchTerm }}".</p>
        </div>
        
        <div v-for="message in displayedMessages" :key="message.id || message.timestamp" 
             :class="['message', { 'sent': message.senderId === currentUserId, 'received': message.senderId !== currentUserId }]">
          
          <span v-if="message.senderId !== currentUserId" class="message-sender">{{ getSenderUsername(message.senderId) }}:</span>
          
          <div class="message-content">
            <span v-if="message.type === 'text' || !message.type" class="message-text" v-html="highlightSearchTerm(message.text)"></span>
            
            <div v-if="message.type === 'image'" class="message-media">
              <a :href="getServerUrl(message.url)" target="_blank" rel="noopener noreferrer">
                <img :src="getServerUrl(message.url)" :alt="highlightSearchTerm(message.originalFilename || 'Chat Image')" class="chat-image" @load="scrollToBottom"/>
              </a>
              <span v-if="message.originalFilename" class="original-filename" v-html="highlightSearchTerm(message.originalFilename)"></span>
            </div>

            <div v-if="message.type === 'video'" class="message-media">
              <video controls :src="getServerUrl(message.url)" class="chat-video" @loadeddata="scrollToBottom">
                Your browser does not support the video tag.
              </video>
              <a :href="getServerUrl(message.url)" target="_blank" rel="noopener noreferrer" class="original-filename download-link">
                <span v-html="highlightSearchTerm(message.originalFilename || 'Download Video')"></span>
              </a>
            </div>
          </div>
          
          <span class="message-timestamp">{{ formatTimestamp(message.timestamp) }}</span>

          <!-- Reactions Display -->
          <div class="reactions-container" v-if="message.reactions && Object.keys(message.reactions).length > 0">
            <span 
              v-for="(userIds, emoji) in message.reactions" 
              :key="emoji" 
              class="reaction-emoji" 
              :class="{ 'reacted-by-user': userHasReacted(message.id, emoji) }"
              @click="toggleReaction(message.id, emoji)"
              :title="getReactionTooltip(message.id, emoji)"
            >
              {{ emoji }} {{ userIds.length }}
            </span>
          </div>

          <!-- Reaction Picker Button -->
           <button 
                @click.stop="openReactionPicker(message.id)" 
                class="reaction-picker-btn"
                title="Add reaction">
                😊
            </button>
            <div 
                v-if="showReactionPickerFor === message.id" 
                class="reaction-palette"
                v-click-outside="() => closeReactionPicker(message.id)">
                <span 
                    v-for="emoji in availableReactions" 
                    :key="emoji" 
                    @click.stop="toggleReaction(message.id, emoji)">
                    {{ emoji }}
                </span>
            </div>
        </div>
         <div v-if="uploadingFile" class="message sent uploading-placeholder">
            <div class="message-text">
                <em>Uploading {{ selectedFileName }}... ({{ uploadProgress }}%)</em>
            </div>
        </div>
      </div>
      <form @submit.prevent="handleSendTextMessage" class="message-input-form">
        <button type="button" @click="triggerFileInput" class="file-input-btn" :disabled="!currentChatId || uploadingFile" title="Send image or video">
          <img src="/clip.png" alt="Attach file" width="30" height="30">
        </button>
        <input 
          type="file" 
          ref="fileInput" 
          @change="handleFileSelected" 
          accept="image/*,video/*" 
          style="display: none;" 
          :disabled="uploadingFile"
        />
        <input 
            type="text" 
            v-model="newMessageText" 
            placeholder="Type a message or attach a file..." 
            :disabled="!currentChatId || uploadingFile" 
            @keyup.enter="handleSendTextMessage"
        />
        <button type="submit" :disabled="(!newMessageText.trim() && !selectedFile) || !currentChatId || uploadingFile">
          Send
        </button>
      </form>
    </div>
  </div>
</template>

<script>
// Directive for v-click-outside
const clickOutsideDirective = {
  mounted(el, binding) {
    el.__ClickOutsideHandler__ = event => {
      if (!(el === event.target || el.contains(event.target))) {
        binding.value(event);
      }
    };
    document.body.addEventListener('click', el.__ClickOutsideHandler__);
  },
  beforeUnmount(el) {
    document.body.removeEventListener('click', el.__ClickOutsideHandler__);
  },
};

export default {
  name: 'ChatView',
  directives: {
    'click-outside': clickOutsideDirective
  },
  props: {
    messages: {
      type: Array,
      required: true,
    },
    currentChatId: {
      type: String,
      default: null,
    },
    currentUserId: {
      type: String,
      default: null
    },
    chatParticipants: {
        type: Array,
        default: () => []
    },
    isLoadingMessages: {
        type: Boolean,
        default: false,
    }
  },
  data() {
    return {
      newMessageText: '',
      selectedFile: null,
      selectedFileName: '',
      uploadingFile: false,
      uploadProgress: 0,
      serverBaseUrl: 'http://localhost:3000', // Adjust if your backend URL is different
      searchTerm: '', // Added for search
      availableReactions: ['👍', '❤️', '😂', '😮', '😢', '🙏'],
      showReactionPickerFor: null, // message.id for which picker is open
    };
  },
  computed: {
    displayedMessages() {
      if (!this.searchTerm.trim()) {
        return this.messages; // Return all messages if no search term
      }
      const lowerSearchTerm = this.searchTerm.trim().toLowerCase();
      return this.messages.filter(message => {
        if (message.type === 'text' || !message.type) {
          return message.text && message.text.toLowerCase().includes(lowerSearchTerm);
        }
        // For file messages, also search in originalFilename if it exists
        if (message.originalFilename && message.originalFilename.toLowerCase().includes(lowerSearchTerm)) {
            return true;
        }
        // Optionally, if you store other metadata with files that could be searched, add here
        return false; // Default to not matching if not text and filename doesn't match
      });
    }
  },
  watch: {
    messages: {
      handler() {
        // Only scroll to bottom if not actively searching, to keep search results in view
        if (!this.searchTerm.trim()) {
            this.scrollToBottom();
        }
      },
      deep: true
    },
    currentChatId(newVal, oldVal) {
        this.newMessageText = '';
        this.selectedFile = null;
        this.selectedFileName = '';
        this.uploadingFile = false;
        this.uploadProgress = 0;
        this.searchTerm = '';
        this.showReactionPickerFor = null; // Close picker on chat change
        if (this.$refs.fileInput) {
            this.$refs.fileInput.value = null;
        }
        if (newVal !== oldVal) { // Only scroll if chat actually changed
            this.scrollToBottom();
        }
    },
    displayedMessages() {
        // If search results change, and user was scrolled to bottom, try to maintain it
        // This is tricky; for now, we only auto-scroll if search is cleared
        if (!this.searchTerm.trim()) {
            this.scrollToBottom();
        }
    }
  },
  methods: {
    getServerUrl(relativePath) {
        if (!relativePath) return '';
        // If URL is already absolute, return it. Otherwise, prepend serverBaseUrl.
        if (relativePath.startsWith('http') || relativePath.startsWith('//')) {
            return relativePath;
        }
        return `${this.serverBaseUrl}${relativePath}`;
    },
    formatTimestamp(timestamp) {
      if (!timestamp) return '';
      return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    },
    handleSendTextMessage() {
      if (!this.newMessageText.trim() || !this.currentChatId || this.uploadingFile) return;
      this.$emit('sendMessage', {
        text: this.newMessageText,
        chatId: this.currentChatId,
        type: 'text',
      });
      this.newMessageText = '';
      this.$nextTick(() => {
          this.scrollToBottom();
      });
    },
    triggerFileInput() {
      this.$refs.fileInput.click();
    },
    handleFileSelected(event) {
      const file = event.target.files[0];
      if (!file) {
        this.selectedFile = null;
        this.selectedFileName = '';
        return;
      }
      
      // Basic validation (can be expanded)
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/webm', 'video/ogg'];
      if (!allowedTypes.includes(file.type)) {
          alert('Unsupported file type. Please select an image (JPEG, PNG, GIF) or video (MP4, WebM, OGG).');
          this.$refs.fileInput.value = null; // Reset file input
          return;
      }
      const maxSize = 50 * 1024 * 1024; // 50MB (matches backend)
      if (file.size > maxSize) {
          alert(`File is too large. Maximum size is ${maxSize / (1024*1024)}MB.`);
          this.$refs.fileInput.value = null; // Reset file input
          return;
      }

      this.selectedFile = file;
      this.selectedFileName = file.name;
      // Automatically try to upload if "Send" button is clicked or Enter is pressed with a file selected.
      // The form's submit button is now generic. We decide here if it's a text or file send.
      // For simplicity, we can make the "Send" button trigger upload if a file is selected.
      // Or, a dedicated upload button could appear.
      // Current logic: if selectedFile exists, "Send" button will trigger uploadFile via handleFormSubmit.
      // Let's modify the main send button to handle both text and file.
      // The primary action will be to upload if a file is selected, otherwise send text.
      // The form submission is now handled by `handleFormSubmit` triggered by the submit button
      // For this iteration, let's immediately try to upload.
      this.uploadFile();
    },
    async uploadFile() {
      if (!this.selectedFile || !this.currentChatId) {
        alert('Please select a file and ensure a chat is active.');
        return;
      }

      this.uploadingFile = true;
      this.uploadProgress = 0;

      const formData = new FormData();
      formData.append('mediaFile', this.selectedFile);
      // chatId is in the URL for the backend endpoint: /api/upload/:chatId

      const token = localStorage.getItem('authToken');
      if (!token) {
          alert('Authentication token not found. Please log in again.');
          this.uploadingFile = false;
          return;
      }
      
      try {
        // Using XMLHttpRequest for progress tracking, could use Axios with onUploadProgress too
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${this.serverBaseUrl}/api/upload/${this.currentChatId}`, true);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            this.uploadProgress = Math.round((event.loaded / event.total) * 100);
          }
        };

        xhr.onload = () => {
          this.uploadingFile = false;
          this.uploadProgress = 100; // Mark as complete

          if (xhr.status >= 200 && xhr.status < 300) {
            const response = JSON.parse(xhr.responseText);
            this.$emit('sendMessage', {
              chatId: this.currentChatId,
              type: response.type, // 'image' or 'video'
              url: response.fileUrl,
              originalFilename: response.originalFilename,
              // senderId will be added by parent (ChatPage.vue)
            });
          } else {
            let errorMessage = 'File upload failed.';
            try {
                const errorResponse = JSON.parse(xhr.responseText);
                errorMessage = errorResponse.message || errorMessage;
            } catch (e) { /* Ignore parsing error, use default message */ }
            console.error('Upload error:', xhr.status, xhr.responseText);
            alert(`Error: ${errorMessage}`);
          }
          this.selectedFile = null;
          this.selectedFileName = '';
          if (this.$refs.fileInput) {
            this.$refs.fileInput.value = null; // Reset file input
          }
          this.$nextTick(() => this.scrollToBottom());
        };

        xhr.onerror = () => {
          console.error('Network error during upload.');
          alert('Network error during upload. Please try again.');
          this.uploadingFile = false;
           this.selectedFile = null;
          this.selectedFileName = '';
          if (this.$refs.fileInput) {
            this.$refs.fileInput.value = null; // Reset file input
          }
        };
        
        xhr.send(formData);

      } catch (error) {
        console.error('Error uploading file:', error);
        alert('An unexpected error occurred during upload.');
        this.uploadingFile = false;
        this.selectedFile = null;
        this.selectedFileName = '';
         if (this.$refs.fileInput) {
            this.$refs.fileInput.value = null;
        }
      }
    },
    getSenderUsername(senderId) {
        const participant = this.chatParticipants.find(p => p.id === senderId);
        return participant ? participant.username : 'Unknown User';
    },
    scrollToBottom(){
        this.$nextTick(() => {
            const container = this.$refs.messagesContainer;
            if(container){
                // Scroll a bit more if an image/video might have just loaded and changed height
                container.scrollTop = container.scrollHeight + 50;
            }
        });
    },
    clearSearch() {
      this.searchTerm = '';
      // We might want to scroll to bottom when search is cleared
      this.$nextTick(() => this.scrollToBottom()); 
    },
    highlightSearchTerm(text) {
      if (!this.searchTerm.trim() || !text) {
        return text;
      }
      const lowerSearchTerm = this.searchTerm.trim().toLowerCase();
      const lowerText = text.toLowerCase();
      let highlightedText = '';
      let lastIndex = 0;
      let index = lowerText.indexOf(lowerSearchTerm, lastIndex);

      while (index !== -1) {
        highlightedText += text.substring(lastIndex, index);
        highlightedText += `<mark class="search-highlight">${text.substring(index, index + this.searchTerm.trim().length)}</mark>`;
        lastIndex = index + this.searchTerm.trim().length;
        index = lowerText.indexOf(lowerSearchTerm, lastIndex);
      }
      highlightedText += text.substring(lastIndex);
      return highlightedText;
    },
    toggleReaction(messageId, emoji) {
      console.log(`ChatView: toggleReaction called. Message ID: ${messageId}, Emoji: ${emoji}, User ID: ${this.currentUserId}`);
      if (!this.currentUserId) {
        alert('You must be logged in to react.');
        console.warn('ChatView: toggleReaction - No currentUserId. Reaction aborted.');
        return;
      }
      console.log('ChatView: Emitting @toggleReaction with payload:', { messageId, reactionEmoji: emoji });
      this.$emit('toggleReaction', { messageId, reactionEmoji: emoji });
      
      if (this.showReactionPickerFor === messageId) {
          console.log(`ChatView: Reaction picker was open for message ${messageId}, calling closeReactionPicker.`);
          this.closeReactionPicker(messageId);
      } else {
          console.log(`ChatView: Reaction picker was NOT open for message ${messageId} (showReactionPickerFor is ${this.showReactionPickerFor}), so not closing it from toggleReaction.`);
      }
    },
    userHasReacted(messageId, emoji) {
      const message = this.messages.find(m => m.id === messageId);
      return message?.reactions?.[emoji]?.includes(this.currentUserId);
    },
    getReactionTooltip(messageId, emoji) {
        const message = this.messages.find(m => m.id === messageId);
        if (!message || !message.reactions || !message.reactions[emoji]) return '';
        
        const userIds = message.reactions[emoji];
        if (userIds.length === 0) return '';

        const usernames = userIds.map(uid => {
            const participant = this.chatParticipants.find(p => p.id === uid);
            return participant ? participant.username : 'Someone';
        });

        let tooltip = usernames.slice(0, 3).join(', ');
        if (usernames.length > 3) {
            tooltip += ` and ${usernames.length - 3} more`;
        }
        return tooltip;
    },
    openReactionPicker(messageId) {
        console.log(`ChatView: openReactionPicker called for messageId: ${messageId}. Current showReactionPickerFor: ${this.showReactionPickerFor}`);
        if (this.showReactionPickerFor === messageId) {
            this.showReactionPickerFor = null; // Toggle off if already open
            console.log(`ChatView: Toggled OFF reaction picker for messageId: ${messageId}`);
        } else {
            this.showReactionPickerFor = messageId;
            console.log(`ChatView: Toggled ON reaction picker for messageId: ${messageId}`);
        }
    },
    closeReactionPicker(messageId) {
        console.log(`ChatView: closeReactionPicker called for messageId: ${messageId}. Current showReactionPickerFor: ${this.showReactionPickerFor}`);
        // Only close if it's the one currently open
        if (this.showReactionPickerFor === messageId) {
             this.showReactionPickerFor = null;
             console.log(`ChatView: Picker closed for messageId ${messageId}. showReactionPickerFor is now null.`);
        } else {
            console.log(`ChatView: Picker NOT closed for messageId ${messageId} because it wasn't the one open (or already null).`);
        }
    }
  },
  mounted() {
      this.scrollToBottom();
  }
};
</script>

<style scoped src="../assets/chat.css"></style>