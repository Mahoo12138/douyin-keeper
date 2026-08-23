<template>
  <div>
    <!-- SEO Head -->
    <Head>
      <title>{{ t('home.metadata.title') }}</title>
      <meta name="description" :content="t('home.metadata.description')" />
      <meta name="keywords" :content="t('home.metadata.keywords')" />
    </Head>    
    <div class="flex flex-col min-h-screen bg-background">
      <!-- Hero Section -->
      <section class="relative min-h-screen flex items-center justify-center overflow-hidden">
        <!-- Background decorations -->
        <div class="absolute inset-0 bg-gradient-to-br from-background via-background to-muted">
          <div class="absolute top-20 left-10 w-72 h-72 bg-chart-1 rounded-full filter blur-3xl opacity-15 dark:opacity-30 animate-blob"></div>
          <div class="absolute top-40 right-10 w-72 h-72 bg-chart-2 rounded-full filter blur-3xl opacity-15 dark:opacity-30 animate-blob animation-delay-2000"></div>
          <div class="absolute -bottom-8 left-20 w-72 h-72 bg-chart-4 rounded-full filter blur-3xl opacity-15 dark:opacity-30 animate-blob animation-delay-4000"></div>
        </div>
        
        <div class="container px-4 md:px-6 relative z-10">
          <motion.div 
            class="flex flex-col items-center text-center space-y-8 max-w-4xl mx-auto"
            :initial="{ opacity: 0, scale: 0.9 }"
            :animate="{ opacity: 1, scale: 1 }"
            :transition="{ duration: 0.8, ease: 'easeOut' }"
          >
            <motion.h1 
              class="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-foreground"
              :initial="{ opacity: 0, y: 20 }"
              :animate="{ opacity: 1, y: 0 }"
              :transition="{ duration: 0.8, delay: 0.2 }"
            >
              {{ t('home.hero.titlePrefix') }}
              <span class="text-gradient-chart-warm">
                {{ t('home.hero.titleHighlight') }}
              </span>
              {{ t('home.hero.titleSuffix') }}
            </motion.h1>
            
            <motion.p 
              class="text-xl md:text-2xl text-muted-foreground max-w-3xl leading-relaxed"
              :initial="{ opacity: 0, y: 20 }"
              :animate="{ opacity: 1, y: 0 }"
              :transition="{ duration: 0.8, delay: 0.4 }"
            >
              {{ t('home.hero.subtitle') }}
            </motion.p>

            <motion.div 
              class="flex flex-col sm:flex-row gap-4 pt-4"
              :initial="{ opacity: 0, y: 20 }"
              :animate="{ opacity: 1, y: 0 }"
              :transition="{ duration: 0.8, delay: 0.6 }"
            >
              <Button 
                size="lg" 
                class="px-8 py-4 text-lg rounded-full transition-all duration-300 hover:scale-105"
                @click="navigateTo(localePath('/pricing'))"
              >
                {{ t('home.hero.buttons.purchase') }}
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                class="px-8 py-4 text-lg rounded-full transition-all duration-300 hover:scale-105"
              >
                {{ t('home.hero.buttons.demo') }}
              </Button>
            </motion.div>

            <motion.div 
              class="flex items-center gap-6 text-sm text-muted-foreground pt-4"
              :initial="{ opacity: 0 }"
              :animate="{ opacity: 1 }"
              :transition="{ duration: 0.8, delay: 0.8 }"
            >
              <div class="flex items-center gap-2">
                <Check class="h-4 w-4 text-primary" />
                <span>{{ t('home.hero.features.lifetime') }}</span>
              </div>
              <div class="flex items-center gap-2">
                <Check class="h-4 w-4 text-primary" />
                <span>{{ t('home.hero.features.earlyBird') }}</span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <!-- Features Section -->
      <section class="py-24 bg-muted/50">
        <div class="container px-4 md:px-6">
          <motion.div 
            class="text-center mb-16"
            :initial="{ opacity: 0, y: 20 }"
            :whileInView="{ opacity: 1, y: 0 }"
            :transition="{ duration: 0.6 }"
            :viewport="{ once: true }"
          >
            <h2 class="text-3xl md:text-4xl font-bold text-foreground mb-4">
              {{ t('home.features.title') }}
            </h2>
            <p class="text-xl text-muted-foreground max-w-2xl mx-auto">
              {{ t('home.features.subtitle') }}
            </p>
          </motion.div>

          <BentoGrid class="max-w-7xl mx-auto auto-rows-[14rem] grid-cols-4 gap-4">
            <template v-for="(feature, index) in tm('home.features.items') as any" :key="index">
              <motion.div
                :initial="{ opacity: 0, y: 20 }"
                :whileInView="{ opacity: 1, y: 0 }"
                :transition="{ duration: 0.6, delay: index * 0.1 }"
                :viewport="{ once: true }"
              >
                <BentoCard
                  :name="rt(feature.title)"
                  :description="rt(feature.description)"
                  :icon="iconMap[index]"
                  :className="`${rt(feature.className)} group hover:scale-[1.02] transition-all duration-300 hover:shadow-xl bg-card border border-border hover:border-border/80 h-full`"
                  href="#"
                  :cta="t('home.common.learnMore')"
                >
                  <template #background>
                    <div 
                      class="absolute inset-0 opacity-5 dark:opacity-15 group-hover:opacity-10 dark:group-hover:opacity-25 transition-opacity duration-300 rounded-xl bg-gradient-chart-warm"
                    />
                  </template>
                </BentoCard>
              </motion.div>
            </template>
          </BentoGrid>

          <!-- Tech Stack Display -->
          <motion.div 
            class="mt-20 text-center"
            :initial="{ opacity: 0, y: 20 }"
            :whileInView="{ opacity: 1, y: 0 }"
            :transition="{ duration: 0.6, delay: 0.3 }"
            :viewport="{ once: true }"
          >
            <h3 class="text-xl font-semibold text-foreground mb-8">{{ t('home.features.techStack.title') }}</h3>
            <div class="flex flex-wrap justify-center items-center gap-8 max-w-4xl mx-auto">
              <div 
                v-for="(tech, index) in tm('home.features.techStack.items') as any"
                :key="index"
                class="flex items-center space-x-2 px-4 py-2 bg-card rounded-full border border-border shadow-sm"
              >
                <div :class="`w-2 h-2 bg-chart-${(index % 5) + 1} rounded-full`"></div>
                <span class="text-card-foreground font-medium">{{ tech }}</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <!-- Application Features Details -->
      <section class="py-24 bg-background">
        <div class="container px-4 md:px-6">
          <motion.div 
            class="text-center mb-16"
            :initial="{ opacity: 0, y: 20 }"
            :whileInView="{ opacity: 1, y: 0 }"
            :transition="{ duration: 0.6 }"
            :viewport="{ once: true }"
          >
            <h2 class="text-3xl md:text-4xl font-bold text-foreground mb-4">
              {{ t('home.applicationFeatures.title') }}
            </h2>
            <p class="text-xl text-muted-foreground max-w-2xl mx-auto">
              {{ t('home.applicationFeatures.subtitle') }}
            </p>
          </motion.div>

          <div class="max-w-6xl mx-auto">
            <div class="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
              <!-- Left: Feature List -->
              <div class="lg:col-span-2 space-y-4">
                <motion.div
                  v-for="(feature, index) in tm('home.applicationFeatures.items') as any"
                  :key="index"
                  :class="[
                    'p-6 rounded-2xl border-2 cursor-pointer transition-all duration-300',
                    activeFeature === index
                      ? 'border-primary bg-primary/5 shadow-lg'
                      : 'border-border bg-card hover:border-border/80 hover:shadow-md'
                  ]"
                  @click="activeFeature = index"
                  :initial="{ opacity: 0, x: -20 }"
                  :whileInView="{ opacity: 1, x: 0 }"
                  :transition="{ duration: 0.6, delay: index * 0.1 }"
                  :viewport="{ once: true }"
                >
                  <div class="space-y-3">
                    <div class="flex items-center space-x-3">
                      <div :class="[
                        'w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg',
                        activeFeature === index ? 'bg-chart-1' : 'bg-muted-foreground'
                      ]">
                        {{ index + 1 }}
                      </div>
                      <h3 :class="[
                        'text-lg font-bold',
                        activeFeature === index ? 'text-primary' : 'text-foreground'
                      ]">
                        {{ feature.title }}
                      </h3>
                    </div>
                    <p :class="[
                      'text-sm leading-relaxed pl-13',
                      activeFeature === index ? 'text-primary/80' : 'text-muted-foreground'
                    ]">
                      {{ feature.subtitle }}
                    </p>
                    <!-- Show highlights for active item -->
                    <motion.div 
                      v-if="activeFeature === index"
                      class="pl-13 space-y-2"
                      :initial="{ opacity: 0, height: 0 }"
                      :animate="{ opacity: 1, height: 'auto' }"
                      :transition="{ duration: 0.3 }"
                    >
                      <div 
                        v-for="(highlight, idx) in feature.highlights"
                        :key="idx"
                        class="flex items-center space-x-2"
                      >
                        <div class="w-1.5 h-1.5 rounded-full bg-chart-1"></div>
                        <span class="text-primary/80 text-xs font-medium">{{ highlight }}</span>
                      </div>
                    </motion.div>
                  </div>
                </motion.div>
              </div>

              <!-- Right: Image and Description -->
              <div class="lg:col-span-3">
                <motion.div
                  :key="activeFeature"
                  :initial="{ opacity: 0, y: 20 }"
                  :animate="{ opacity: 1, y: 0 }"
                  :transition="{ duration: 0.5 }"
                  class="space-y-6"
                >
                  <!-- Image placeholder -->
                  <div class="aspect-[16/10] bg-gradient-to-br from-primary/5 to-muted rounded-2xl border border-border flex items-center justify-center overflow-hidden">
                    <div class="w-full h-full bg-gradient-to-br from-primary/10 to-muted/50 flex items-center justify-center">
                      <div class="text-center space-y-4">
                        <component 
                          :is="appIconMap[activeFeature]"
                          class="h-20 w-20 text-primary mx-auto"
                        />
                        <div class="text-muted-foreground font-medium text-lg">{{ (tm('home.applicationFeatures.items') as any)[activeFeature].imageTitle }}</div>
                        <div class="text-sm text-muted-foreground/80">{{ t('home.common.demoInterface') }}</div>
                      </div>
                    </div>
                  </div>

                  <!-- Description -->
                  <div class="p-6 bg-muted/50 rounded-2xl">
                    <p class="text-muted-foreground leading-relaxed">
                      {{ (tm('home.applicationFeatures.items') as any)[activeFeature].description }}
                    </p>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>

          <!-- Technical advantage tip -->
          <motion.div 
            class="mt-20 text-center"
            :initial="{ opacity: 0, y: 20 }"
            :whileInView="{ opacity: 1, y: 0 }"
            :transition="{ duration: 0.6, delay: 0.3 }"
            :viewport="{ once: true }"
          >
            <div class="inline-flex items-center space-x-2 px-6 py-3 bg-muted/50 rounded-full border border-border">
              <div class="flex space-x-1">
                <div class="w-2 h-2 bg-chart-1 rounded-full animate-pulse"></div>
                <div class="w-2 h-2 bg-chart-2 rounded-full animate-pulse animation-delay-2000"></div>
                <div class="w-2 h-2 bg-chart-3 rounded-full animate-pulse animation-delay-4000"></div>
              </div>
              <span class="text-muted-foreground font-medium">{{ t('home.common.techArchitecture') }}</span>
            </div>
          </motion.div>
        </div>
      </section>

      <!-- Stats Section -->
      <section class="py-24 bg-background" ref="statsRef">
        <div class="container px-4 md:px-6">
          <motion.div 
            class="text-center mb-16"
            :initial="{ opacity: 0, y: 20 }"
            :whileInView="{ opacity: 1, y: 0 }"
            :transition="{ duration: 0.6 }"
            :viewport="{ once: true }"
          >
            <h2 class="text-3xl md:text-4xl font-bold text-foreground mb-4">
              {{ t('home.stats.title') }}
            </h2>
          </motion.div>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-8">
            <motion.div 
              v-for="(stat, index) in tm('home.stats.items') as any"
              :key="index"
              class="text-center"
              :initial="{ opacity: 0, scale: 0.5 }"
              :whileInView="{ opacity: 1, scale: 1 }"
              :transition="{ duration: 0.6, delay: 0.1 + index * 0.1 }"
              :viewport="{ once: true }"
            >
              <div class="text-4xl md:text-5xl font-bold text-foreground mb-2">
                {{ stat.value }}{{ stat.suffix }}
              </div>
              <div class="text-muted-foreground">{{ stat.label }}</div>
            </motion.div>
          </div>
        </div>
      </section>

      <!-- Testimonials -->
      <section class="py-24 bg-muted/50">
        <div class="container px-4 md:px-6">
          <motion.div 
            class="text-center mb-16"
            :initial="{ opacity: 0, y: 20 }"
            :whileInView="{ opacity: 1, y: 0 }"
            :transition="{ duration: 0.6 }"
            :viewport="{ once: true }"
          >
            <h2 class="text-3xl md:text-4xl font-bold text-foreground mb-4">
              {{ t('home.testimonials.title') }}
            </h2>
          </motion.div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
            <motion.div
              v-for="(testimonial, index) in tm('home.testimonials.items') as any"
              :key="index"
              class="bg-card p-8 rounded-2xl border border-border hover:shadow-lg transition-all duration-300"
              :initial="{ opacity: 0, y: 20 }"
              :whileInView="{ opacity: 1, y: 0 }"
              :transition="{ duration: 0.6, delay: index * 0.1 }"
              :viewport="{ once: true }"
            >
              <div class="flex mb-4">
                <Star v-for="i in 5" :key="i" class="h-5 w-5 text-chart-5 fill-current" />
              </div>
              <p class="text-muted-foreground mb-6 leading-relaxed">"{{ testimonial.quote }}"</p>
              <div class="flex items-center">
                <div 
                  :class="[
                    'w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold mr-4',
                    index === 0 ? 'bg-chart-1' : 
                    index === 1 ? 'bg-chart-3' : 
                    'bg-chart-5'
                  ]"
                >
                  {{ testimonial.author }}
                </div>
                <div>
                  <div class="font-semibold text-foreground">{{ testimonial.author }}</div>
                  <div class="text-muted-foreground text-sm">{{ testimonial.role }}</div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <!-- Final CTA -->
      <section class="py-24 bg-gradient-chart-warm text-white relative overflow-hidden">
        <div class="absolute inset-0 bg-repeat opacity-10"></div>
        <div class="container px-4 md:px-6 relative z-10">
          <motion.div 
            class="text-center max-w-3xl mx-auto"
            :initial="{ opacity: 0, y: 20 }"
            :whileInView="{ opacity: 1, y: 0 }"
            :transition="{ duration: 0.6 }"
            :viewport="{ once: true }"
          >
            <h2 class="text-3xl md:text-5xl font-bold mb-6">
              {{ t('home.finalCta.title') }}
            </h2>
            <p class="text-xl text-primary-foreground/80 mb-8">
              {{ t('home.finalCta.subtitle') }}
            </p>
            <div class="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                class="px-8 py-4 text-lg rounded-full transition-all duration-300 hover:scale-105"
                @click="navigateTo(localePath('/pricing'))"
              >
                {{ t('home.finalCta.buttons.purchase') }}
              </Button>
              <Button 
                size="lg" 
                variant="secondary" 
                class="px-8 py-4 text-lg rounded-full transition-all duration-300 hover:scale-105"
              >
                {{ t('home.finalCta.buttons.demo') }}
              </Button>
            </div>
          </motion.div>
        </div>
      </section>
      
      <!-- Footer -->
      <footer class="py-12 bg-muted text-muted-foreground">
        <div class="container px-4 md:px-6">
          <div class="flex flex-col md:flex-row justify-between items-center">
            <div class="flex items-center mb-4 md:mb-0">
              <AppLogo size="md" />
            </div>
            <div class="flex flex-col md:flex-row items-center space-y-4 md:space-y-0 md:space-x-6">
              <div class="text-muted-foreground text-center md:text-left">
                {{ t('home.footer.copyright', { year: new Date().getFullYear() }) }}
              </div>
              <div class="flex space-x-4">
                <div class="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center hover:bg-muted/50 transition-colors cursor-pointer">
                  <span class="text-xs text-foreground">G</span>
                </div>
                <div class="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center hover:bg-muted/50 transition-colors cursor-pointer">
                  <span class="text-xs text-foreground">T</span>
                </div>
                <div class="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center hover:bg-muted/50 transition-colors cursor-pointer">
                  <span class="text-xs text-foreground">D</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { motion } from 'motion-v'
import { 
  Check, 
  Shield, 
  Globe, 
  Zap, 
  BarChart3, 
  Smartphone, 
  Star, 
  Brain, 
  Code, 
  Layers
} from 'lucide-vue-next'
import BentoGrid from '@/components/magicui/BentoGrid.vue'
import BentoCard from '@/components/magicui/BentoCard.vue'

// SEO and metadata
const { t, tm, rt, locale } = useI18n()
const localePath = useLocalePath()

useSeoMeta({
  title: () => t('home.metadata.title'),
  description: () => t('home.metadata.description'),
  keywords: () => t('home.metadata.keywords')
})

// Reactive state
const activeFeature = ref(0)
const statsRef = ref(null)

// Icon mappings for features
const iconMap = [Layers, Shield, Globe, Zap, BarChart3, Smartphone, Brain, Code]
const appIconMap = [Globe, Layers, BarChart3, Brain]  

// Features data

</script>

<style scoped>
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Animation classes */
@keyframes blob {
  0% {
    transform: translate(0px, 0px) scale(1);
  }
  33% {
    transform: translate(30px, -50px) scale(1.1);
  }
  66% {
    transform: translate(-20px, 20px) scale(0.9);
  }
  100% {
    transform: translate(0px, 0px) scale(1);
  }
}

.animate-blob {
  animation: blob 7s infinite;
}

.animation-delay-2000 {
  animation-delay: 2s;
}

.animation-delay-4000 {
  animation-delay: 4s;
}

</style>
