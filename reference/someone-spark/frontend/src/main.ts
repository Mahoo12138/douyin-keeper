import { createApp } from "vue";
import { createPinia } from "pinia";
import Antd from "ant-design-vue";
import "ant-design-vue/dist/reset.css";
import App from "./App.vue";
import router from "./router";
import { useSessionStore } from "./stores/session";
import "./styles/console.css";
const app = createApp(App);
app.use(createPinia());
app.use(Antd);
const session = useSessionStore();
session.bootstrap().finally(() => {
  app.use(router);
  app.mount("#app");
});
