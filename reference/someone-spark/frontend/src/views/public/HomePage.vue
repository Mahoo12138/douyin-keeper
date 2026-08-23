<template>
  <main>
    <section class="hero">
      <div>
        <h1>每天自动给好友续上火花</h1>
        <p class="lead">定时发一条、多号共享套餐，打开网页就能管。</p>
        <div class="hero-cta">
          <router-link v-if="!session.loggedIn && registerOn" class="btn btn-solid" to="/register">注册开通</router-link>
          <router-link v-else-if="!session.loggedIn" class="btn btn-solid" to="/login">登录</router-link>
          <router-link v-else class="btn btn-solid" :to="consolePath">进入控制台</router-link>
          <router-link v-if="!session.loggedIn" class="btn btn-ghost" to="/login">已有账号</router-link>
        </div>
        <p class="hint">卡密开通，按周/月计。</p>
      </div>
      <aside class="slip" aria-hidden="true">
        <p class="slip-kicker">控制台</p>
        <p class="slip-note">绑定真实抖音号后，待续好友会出现在这里。现在没有任何名单。</p>
        <div class="slip-bars"><i></i><i></i><i></i></div>
      </aside>
    </section>
    <section id="who" class="block">
      <h2>谁会用得上</h2>
      <ul class="pains">
        <li>每天要记得点开抖音私信</li>
        <li>火花断了只能从头计</li>
        <li>号多了容易漏发、发错人</li>
      </ul>
    </section>
    <section id="features" class="block">
      <h2>功能</h2>
      <dl class="feats">
        <div><dt>定时续火花</dt><dd>按你勾选的好友每天发一条，错过窗口会补。</dd></div>
        <div><dt>多号位共享套餐</dt><dd>一份套餐管名下所有号，加号不必再买时长。</dd></div>
        <div><dt>文字和表情</dt><dd>已有会话走协议发送，失败再回浏览器。</dd></div>
        <div><dt>聊天归档</dt><dd>会话进云端留着，解绑也不删，方便抽查。</dd></div>
        <div><dt>风控暂停</dt><dd>触发限流就停这个号，别的号继续跑。</dd></div>
        <div><dt>卡密开通</dt><dd>兑余额或套餐，没有微信支付。</dd></div>
      </dl>
    </section>
    <section id="how" class="block">
      <h2>怎么用</h2>
      <ol class="steps">
        <li><strong>1</strong> 注册开通</li>
        <li><strong>2</strong> 绑定抖音号</li>
        <li><strong>3</strong> 勾选好友定时发</li>
      </ol>
    </section>
    <footer class="mkt-footer">
      <p>{{ name }} · 自动化可能违反平台规则，使用需自担风险。</p>
      <p><router-link to="/login">登录</router-link> · <router-link v-if="registerOn" to="/register">注册</router-link></p>
    </footer>
  </main>
</template>
<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useSessionStore } from "../../stores/session";
const session = useSessionStore();
const name = computed(() => session.site?.name || "火花");
const registerOn = computed(() => session.site?.register_enabled !== false);
const consolePath = computed(() => (session.isAdmin ? "/admin/dashboard" : "/dashboard"));
onMounted(() => {
  const title = session.site?.seo_title || "火花 — 每天自动给好友续上火花";
  const desc = session.site?.seo_description || "定时给抖音好友续火花。网页管理，多号共享一份套餐，卡密开通。";
  document.title = title;
  const el = document.querySelector('meta[name="description"]');
  if (el) el.setAttribute("content", desc);
});
</script>
