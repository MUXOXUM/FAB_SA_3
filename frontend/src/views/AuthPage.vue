<template>
  <div class="auth-container">
    <div class="logo-section">
      <img src="/logo.png" alt="Alexicon Logo" />
    </div>
    <div class="form-section">
      <h1 class="welcome-message">Добро пожаловать в Alexicon!</h1>
      <div class="auth-form">
        <div class="tabs">
          <button :class="{ active: isLogin }" @click="isLogin = true">Login</button>
          <button :class="{ active: !isLogin }" @click="isLogin = false">Register</button>
        </div>

        <form @submit.prevent="handleSubmit">
          <div v-if="!isLogin" class="form-group">
            <label for="username">Username</label>
            <input type="text" id="username" v-model="username" required />
          </div>
          <div class="form-group">
            <label for="email">Email</label>
            <input type="email" id="email" v-model="email" required />
          </div>
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" v-model="password" required />
          </div>
          <div v-if="!isLogin" class="form-group">
            <label for="confirmPassword">Confirm Password</label>
            <input type="password" id="confirmPassword" v-model="confirmPassword" required />
          </div>
          <button type="submit">{{ isLogin ? 'Login' : 'Register' }}</button>
        </form>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'AuthPage',
  data() {
    return {
      isLogin: true,
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
    };
  },
  methods: {
    handleSubmit() {
      if (this.isLogin) {
        // Handle login
        console.log('Logging in with:', this.email, this.password);
      } else {
        // Handle registration
        if (this.password !== this.confirmPassword) {
          alert("Passwords do not match!");
          return;
        }
        console.log('Registering with:', this.username, this.email, this.password);
      }
      // Add your authentication logic here
    },
  },
};
</script>

<style scoped src="../assets/auth.css"></style> 