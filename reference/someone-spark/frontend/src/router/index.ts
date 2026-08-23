import { createRouter, createWebHistory } from "vue-router";
import { useSessionStore } from "../stores/session";
import MarketingLayout from "../layouts/MarketingLayout.vue";
import AuthPageLayout from "../layouts/AuthPageLayout.vue";
import BasicLayout from "../layouts/BasicLayout.vue";
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: MarketingLayout, children: [{ path: "", name: "home", component: () => import("../views/public/HomePage.vue") }] },
    {
      path: "/",
      component: AuthPageLayout,
      children: [
        { path: "login", name: "login", component: () => import("../views/auth/LoginPage.vue") },
        { path: "register", name: "register", component: () => import("../views/auth/RegisterPage.vue") },
        { path: "forgot-password", name: "forgot", component: () => import("../views/auth/ForgotPage.vue") }
      ]
    },
    {
      path: "/",
      component: BasicLayout,
      meta: { auth: true },
      children: [
        { path: "dashboard", name: "dashboard", component: () => import("../views/user/DashboardPage.vue") },
        { path: "wallet", name: "wallet", component: () => import("../views/user/WalletPage.vue") },
        { path: "account", name: "account", component: () => import("../views/user/AccountPage.vue") },
        { path: "douyin", name: "douyin", component: () => import("../views/user/DouyinListPage.vue") },
        { path: "douyin/:id", name: "douyin-detail", component: () => import("../views/user/DouyinDetailPage.vue") },
        { path: "friends", name: "friends", component: () => import("../views/user/FriendsPage.vue") },
        { path: "chat", name: "chat", component: () => import("../views/user/ChatPage.vue") },
        { path: "tasks", name: "tasks", component: () => import("../views/user/TasksPage.vue") },
        { path: "logs", name: "logs", component: () => import("../views/user/LogsPage.vue") },
        { path: "admin/dashboard", name: "admin-dashboard", component: () => import("../views/admin/AdminDashboardPage.vue"), meta: { admin: true } },
        { path: "admin/users", name: "admin-users", component: () => import("../views/admin/AdminUsersPage.vue"), meta: { admin: true } },
        { path: "admin/plans", name: "admin-plans", component: () => import("../views/admin/AdminPlansPage.vue"), meta: { admin: true } },
        { path: "admin/keys", name: "admin-keys", component: () => import("../views/admin/AdminKeysPage.vue"), meta: { admin: true } },
        { path: "admin/chat-review", name: "admin-chat", component: () => import("../views/admin/AdminChatReviewPage.vue"), meta: { admin: true } },
        { path: "admin/settings", name: "admin-settings", component: () => import("../views/admin/AdminSettingsPage.vue"), meta: { admin: true } },
        { path: "admin/audit", name: "admin-audit", component: () => import("../views/admin/AdminAuditPage.vue"), meta: { admin: true } }
      ]
    }
  ],
  scrollBehavior() {
    return { top: 0 };
  }
});
router.beforeEach(async (to) => {
  const session = useSessionStore();
  if (!session.booted) {
    await session.bootstrap();
  }
  const needAuth = to.matched.some((r) => r.meta.auth);
  const needAdmin = to.matched.some((r) => r.meta.admin);
  if (needAuth && !session.loggedIn) {
    return { path: "/login", query: { redirect: to.fullPath } };
  }
  if ((to.path === "/login" || to.path === "/register" || to.path === "/forgot-password") && session.loggedIn) {
    return session.isAdmin ? "/admin/dashboard" : "/dashboard";
  }
  if (needAdmin && session.loggedIn && !session.isAdmin) {
    return "/dashboard";
  }
  if (to.path === "/dashboard" && session.isAdmin) {
    return "/admin/dashboard";
  }
  return true;
});
export default router;
