<script setup lang="ts">
type Profile = { username?: string; userId?: string; postCount?: number };

const { data: profile, error } = await useFetch<Profile>('/api/profile', {
  server: true,
  headers: useRequestHeaders(['cookie']),
});

if (error.value) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const status = (error.value as any)?.statusCode ?? (error.value as any)?.status;
  if (status === 401 || status === 403) {
    await navigateTo('/login');
  } else {
    throw error.value;
  }
}

if (!profile.value?.username) {
  await navigateTo('/login');
}
</script>

<template>
  <main>
    <h2>Profile</h2>
    <div
      data-testid="profile-card"
      :style="{ background: '#f9f9f9', border: '1px solid #eee', borderRadius: '8px', padding: '1.5rem', maxWidth: '400px' }"
    >
      <p><strong>Username:</strong> <span data-testid="profile-username">{{ profile?.username }}</span></p>
      <p><strong>User ID:</strong> <span data-testid="profile-userid">{{ profile?.userId }}</span></p>
      <p><strong>Posts written:</strong> <span data-testid="profile-post-count">{{ profile?.postCount }}</span></p>
    </div>
    <p :style="{ marginTop: '1rem' }">
      <NuxtLink to="/dashboard">← Back to dashboard</NuxtLink>
    </p>
  </main>
</template>
