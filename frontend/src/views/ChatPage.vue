<template>
  <div class="chat-page">
    <div class="chat-list-container">
      <ChatList />
    </div>
    <div class="chat-view-container">
      <ChatView />
    </div>
  </div>
</template>

<script>
import ChatList from '@/components/ChatList.vue';
import ChatView from '@/components/ChatView.vue';

export default {
  name: 'ChatPage',
  components: {
    ChatList,
    ChatView,
  },
};
</script>

<style scoped>
.chat-page {
  display: flex;
  height: 100vh;
}

.chat-list-container {
  width: 30%;
  border-right: 1px solid #ccc;
  padding: 10px;
  overflow-y: auto;
}

.chat-view-container {
  width: 70%;
  padding: 10px;
  overflow-y: auto;
}
</style>