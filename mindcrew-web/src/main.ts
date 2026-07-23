import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import { ElMessage } from 'element-plus'
import 'uno.css'
import './styles/main.css'

// ECharts
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart, PieChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
} from 'echarts/components'
import { LegacyGridContainLabel } from 'echarts/features'
import VueECharts from 'vue-echarts'

use([CanvasRenderer, LineChart, BarChart, PieChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent, LegacyGridContainLabel])

import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ElementPlus)
app.component('v-chart', VueECharts)

/**
 * 全局错误处理器
 *
 * 考点：Vue 3 错误传播机制
 *   - 组件渲染/更新/侦听器中的错误会沿着组件树向上冒泡
 *   - 如果没有任何 onErrorCaptured 钩子捕获，最终到达 app.config.errorHandler
 *   - 如果没有 errorHandler，Vue 会在控制台打印警告并停止渲染该组件树
 *   - 设置 errorHandler 后，Vue 不会停止渲染，而是将错误交给开发者处理
 *
 * 为什么页面会"突然变黑"：
 *   没有 errorHandler → 子组件渲染抛错 → Vue 停止渲染该组件树
 *   → <router-view> 内容区变空 → 显示为黑色背景（CSS 变量 --color-bg: #141413）
 *   但父组件 MainLayout 不受影响 → 侧边栏仍可点击
 */
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue Error Handler]', err, '\nComponent:', instance, '\nInfo:', info)

  // 避免重复弹框：如果错误已经被组件级 onErrorCaptured 处理，这里就不再弹
  // 通过检查 err 是否带有 __handled 标记来判断
  if ((err as any).__handled) return

  // 向用户展示错误提示，但不阻塞交互
  ElMessage.error({
    message: `页面渲染异常，请尝试刷新页面 (${(err as Error).message || '未知错误'})`,
    duration: 5000,
    showClose: true,
  })
}

app.mount('#app')

