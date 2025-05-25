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
          
          <span class="message-timestamp">{{ formatTimestamp(message.timestamp) }}</span>
        </div>
         <div v-if="uploadingFile" class="message sent uploading-placeholder">
            <div class="message-text">
                <em>Uploading {{ selectedFileName }}... ({{ uploadProgress }}%)</em>
            </div>
        </div>
      </div>
      <form @submit.prevent="handleSendTextMessage" class="message-input-form">
        <button type="button" @click="triggerFileInput" class="file-input-btn" :disabled="!currentChatId || uploadingFile" title="Send image or video">
          📎
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
    currentChatId() {
        this.newMessageText = '';
        this.selectedFile = null;
        this.selectedFileName = '';
        this.uploadingFile = false;
        this.uploadProgress = 0;
        this.searchTerm = ''; // Clear search on chat change
        if (this.$refs.fileInput) {
            this.$refs.fileInput.value = null;
        }
        this.scrollToBottom();
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
  display: flex; /* Use flex for better layout of content within message */
  flex-direction: column; /* Stack sender, content, timestamp vertically */
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
  white-space: pre-wrap; /* Preserve line breaks in text messages */
}

.message-media {
  margin-top: 5px;
  margin-bottom: 5px;
}

.chat-image {
  max-width: 100%;
  max-height: 300px; /* Limit image height */
  border-radius: 8px;
  cursor: pointer; /* To indicate it can be clicked (opens in new tab) */
  object-fit: cover; /* Ensures image covers the area, might crop */
}

.chat-video {
  max-width: 100%;
  max-height: 300px; /* Limit video height */
  border-radius: 8px;
  background-color: #000; /* Background for video player */
}

.original-filename {
    font-size: 0.75em;
    color: #aaa;
    margin-top: 4px;
    display: block;
    word-break: break-all; /* Prevent long filenames from breaking layout */
}
.download-link {
    color: #00cc66;
    text-decoration: none;
}
.download-link:hover {
    text-decoration: underline;
}

.message-timestamp {
  display: block;
  font-size: 0.7em;
  margin-top: 6px;
  text-align: right;
  align-self: flex-end; /* Push timestamp to the end of the flex container */
}
.message.sent .message-timestamp {
    color: #b0b0b0; /* Lighter grey for timestamp on sent messages */
}
.message.received .message-timestamp {
    color: #888; /* Darker grey for timestamp on received messages */
}

.uploading-placeholder {
    opacity: 0.7;
}
.uploading-placeholder .message-text em {
    font-style: normal;
    color: #ccc;
}

.message-input-form {
  display: flex;
  align-items: center; /* Align items vertically */
  padding: 12px 15px;
  border-top: 1px solid #003311; /* Dark green border */
  background-color: #212121; /* Slightly lighter dark for input area */
  gap: 10px;
}

.file-input-btn {
  background: none;
  border: none;
  color: #00ff7f;
  font-size: 1.8em; /* Larger icon */
  padding: 0 8px; /* Adjust padding */
  cursor: pointer;
  line-height: 1; /* Ensure icon is centered */
}
.file-input-btn:disabled {
    color: #555;
    cursor: not-allowed;
}
.file-input-btn:hover:not(:disabled) {
  color: #00cc66;
}

.message-input-form input[type="text"] {
  flex-grow: 1;
  padding: 12px 18px;
  border: 1px solid #333;
  border-radius: 25px; /* Fully rounded for a modern flat look */
  background-color: #2c2c2c; /* Dark input background */
  color: #e0e0e0;
  outline: none;
  font-size: 0.95em;
}
.message-input-form input[type="text"]:focus {
  border-color: #00ff7f; /* Bright green focus border */
  box-shadow: 0 0 0 2px rgba(0, 255, 127, 0.3);
}

.message-input-form button[type="submit"] {
  padding: 12px 25px;
  background-color: #00ff7f; /* Bright green send button */
  color: #1a1a1a; /* Dark text for contrast */
  border: none;
  border-radius: 25px;
  cursor: pointer;
  font-weight: bold;
  transition: background-color 0.2s ease;
  letter-spacing: 0.5px;
  flex-shrink: 0; /* Prevent send button from shrinking */
}
.message-input-form button[type="submit"]:disabled {
  background-color: #444; /* Darker grey for disabled button */
  color: #777;
  cursor: not-allowed;
}
.message-input-form button[type="submit"]:hover:not(:disabled) {
  background-color: #00cc66; /* Slightly darker green on hover */
}

.message-search-bar {
  padding: 8px 15px;
  background-color: #252525; /* Slightly different dark shade */
  border-bottom: 1px solid #003311;
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-input {
  flex-grow: 1;
  padding: 10px 15px;
  border: 1px solid #333;
  border-radius: 20px;
  background-color: #2c2c2c;
  color: #e0e0e0;
  outline: none;
  font-size: 0.9em;
}
.search-input:focus {
  border-color: #00ff7f;
}

.clear-search-btn {
  background: none;
  border: none;
  color: #00ff7f;
  font-size: 1.4em;
  cursor: pointer;
  padding: 5px;
  line-height: 1;
}
.clear-search-btn:hover {
  color: #00cc66;
}

.message-text :deep(.search-highlight) {
    background-color: #00ff7f; /* Bright green highlight */
    color: #1a1a1a; /* Dark text on highlight */
    padding: 0.5px 0;
    border-radius: 2px;
}

.original-filename :deep(.search-highlight) {
    background-color: #00ff7f;
    color: #1a1a1a;
    padding: 0.5px 0;
    border-radius: 2px;
}

/* Ensure messages container takes remaining space after search bar */
.messages-container {
  /* flex-grow: 1; already set */
}
</style> 