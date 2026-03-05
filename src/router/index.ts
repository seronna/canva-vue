import { createWebHistory, createRouter } from "vue-router";

import Canvas from "../views/canvas/PixiCanvas.vue";

const routes = [{ path: "/", component: Canvas }];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
