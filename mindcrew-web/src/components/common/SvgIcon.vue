<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  icon: Component
  color?: string
  size?: string | number
}>()
</script>

<template>
  <el-icon :size="size" :color="color">
    <component :is="icon" />
  </el-icon>
</template>
