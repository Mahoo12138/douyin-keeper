import { createFileRoute } from '@tanstack/react-router'
import { seoHead } from '@/lib/seo'
import { Button } from "@libs/react-shared/ui/button";
import { BentoGrid, BentoCard } from "@libs/react-shared/components/magicui/bento-grid";
import { useTranslation } from "@/hooks/use-translation";
import { useRef, useState, useEffect } from "react";
import { motion, useInView } from "framer-motion";
import React from "react";
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
} from "lucide-react";
import { Logo } from "@libs/react-shared/ui/logo";

export const Route = createFileRoute('/$lang/(root)/')({
  head: ({ params }) => seoHead(params.lang, (t) => t.home.metadata),
  component: HomePage,
})

const iconMap = [Layers, Shield, Globe, Zap, BarChart3, Smartphone, Brain, Code];

const appIconMap = [Globe, Layers, BarChart3, Brain];  

function HomePage() {
  const { t } = useTranslation();
  const [stats, setStats] = useState({
    developers: 0,
    frameworks: 0,
    features: 0,
    satisfaction: 0
  });

  const statsRef = useRef(null);
  const isStatsInView = useInView(statsRef, { once: true });

  useEffect(() => {
    if (isStatsInView) {
      const animateValue = (start: number, end: number, duration: number, setter: (value: number) => void) => {
        let startTimestamp: number | null = null;
        const step = (timestamp: number) => {
          if (!startTimestamp) startTimestamp = timestamp;
          const progress = Math.min((timestamp - startTimestamp) / duration, 1);
          setter(Math.floor(progress * (end - start) + start));
          if (progress < 1) {
            window.requestAnimationFrame(step);
          }
        };
        window.requestAnimationFrame(step);
      };

      animateValue(0, 10000, 2000, (value) => setStats(prev => ({ ...prev, developers: value })));
      animateValue(0, 3, 2000, (value) => setStats(prev => ({ ...prev, frameworks: value })));
      animateValue(0, 50, 2500, (value) => setStats(prev => ({ ...prev, features: value })));
      animateValue(0, 99, 2000, (value) => setStats(prev => ({ ...prev, satisfaction: value })));
    }
  }, [isStatsInView]);

  const [activeFeature, setActiveFeature] = useState(0);

  return (
    <>
      <style>{`
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
      `}</style>
      <div className="flex flex-col min-h-screen bg-background">
        {/* Hero Section */}
        <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
          {/* Background decorations */}
          <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-muted">
            <div className="absolute top-20 left-10 w-72 h-72 bg-chart-1 rounded-full filter blur-3xl opacity-15 dark:opacity-30 animate-blob"></div>
            <div className="absolute top-40 right-10 w-72 h-72 bg-chart-2 rounded-full filter blur-3xl opacity-15 dark:opacity-30 animate-blob animation-delay-2000"></div>
            <div className="absolute -bottom-8 left-20 w-72 h-72 bg-chart-4 rounded-full filter blur-3xl opacity-15 dark:opacity-30 animate-blob animation-delay-4000"></div>
          </div>
        
          <div className="container px-4 md:px-6 relative z-10">
            <motion.div 
              className="flex flex-col items-center text-center space-y-8 max-w-4xl mx-auto"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <motion.h1 
                className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-foreground"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
              >
                {t.home.hero.titlePrefix}
                <span className="text-gradient-chart-warm">
                  {t.home.hero.titleHighlight}
                </span>
                {t.home.hero.titleSuffix}
              </motion.h1>
              
              <motion.p 
                className="text-xl md:text-2xl text-muted-foreground max-w-3xl leading-relaxed"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
              >
                {t.home.hero.subtitle}
              </motion.p>

              <motion.div 
                className="flex flex-col sm:flex-row gap-4 pt-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.6 }}
              >
                <Button 
                  size="lg" 
                  className="px-8 py-4 text-lg rounded-full transition-all duration-300 hover:scale-105"
                >
                  {t.home.hero.buttons.purchase}
                </Button>
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="px-8 py-4 text-lg rounded-full transition-all duration-300 hover:scale-105"
                >
                  {t.home.hero.buttons.demo}
                </Button>
              </motion.div>

              <motion.div 
                className="flex items-center gap-6 text-sm text-muted-foreground pt-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: 0.8 }}
              >
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  <span>{t.home.hero.features.lifetime}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  <span>{t.home.hero.features.earlyBird}</span>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-24 bg-muted/50">
          <div className="container px-4 md:px-6">
            <motion.div 
              className="text-center mb-16"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                {t.home.features.title}
              </h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                {t.home.features.subtitle}
              </p>
            </motion.div>

            <BentoGrid className="max-w-7xl mx-auto auto-rows-[14rem] grid-cols-4 gap-4">
              {t.home.features.items.map((feature: any, index: number) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  viewport={{ once: true }}
                >
                  <BentoCard
                    name={feature.title}
                    description={feature.description}
                    Icon={iconMap[index]}
                    className={`${feature.className} group hover:scale-[1.02] transition-all duration-300 hover:shadow-xl bg-card border border-border hover:border-border/80 h-full`}
                    background={
                      <div 
                        className="absolute inset-0 opacity-5 dark:opacity-15 group-hover:opacity-10 dark:group-hover:opacity-25 transition-opacity duration-300 rounded-xl bg-gradient-chart-warm"
                      />
                    }
                    cta={t.home.common.learnMore}
                    href='#'
                  />
                </motion.div>
              ))}
            </BentoGrid>

            {/* Tech Stack Display */}
            <motion.div 
              className="mt-20 text-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              viewport={{ once: true }}
            >
              <h3 className="text-xl font-semibold text-foreground mb-8">{t.home.features.techStack.title}</h3>
              <div className="flex flex-wrap justify-center items-center gap-8 max-w-4xl mx-auto">
                {t.home.features.techStack.items.map((tech: string, index: number) => (
                  <div key={index} className="flex items-center space-x-2 px-4 py-2 bg-card rounded-full border border-border shadow-sm">
                    <div className={`w-2 h-2 bg-chart-${(index % 5) + 1} rounded-full`}></div>
                    <span className="text-card-foreground font-medium">{tech}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Application Features Details */}
        <section className="py-24 bg-background">
          <div className="container px-4 md:px-6">
            <motion.div 
              className="text-center mb-16"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                {t.home.applicationFeatures.title}
              </h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                {t.home.applicationFeatures.subtitle}
              </p>
            </motion.div>

            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
                {/* Left: Feature List */}
                <div className="lg:col-span-2 space-y-4">
                  {t.home.applicationFeatures.items.map((feature: any, index: number) => (
                    <motion.div
                      key={index}
                      className={`p-6 rounded-2xl border-2 cursor-pointer transition-all duration-300 ${
                        activeFeature === index
                          ? 'border-primary bg-primary/5 shadow-lg'
                          : 'border-border bg-card hover:border-border/80 hover:shadow-md'
                      }`}
                      onClick={() => setActiveFeature(index)}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.6, delay: index * 0.1 }}
                      viewport={{ once: true }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center space-x-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg ${
                            activeFeature === index
                              ? 'bg-chart-1'
                              : 'bg-muted-foreground'
                          }`}>
                            {index + 1}
                          </div>
                          <h3 className={`text-lg font-bold ${
                            activeFeature === index ? 'text-primary' : 'text-foreground'
                          }`}>
                            {feature.title}
                          </h3>
                        </div>
                        <p className={`text-sm leading-relaxed pl-13 ${
                          activeFeature === index ? 'text-primary/80' : 'text-muted-foreground'
                        }`}>
                          {feature.subtitle}
                        </p>
                        {activeFeature === index && (
                          <motion.div 
                            className="pl-13 space-y-2"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            transition={{ duration: 0.3 }}
                          >
                            {feature.highlights.map((highlight: string, idx: number) => (
                              <div key={idx} className="flex items-center space-x-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-chart-1"></div>
                                <span className="text-primary/80 text-xs font-medium">{highlight}</span>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Right: Image and Description */}
                <div className="lg:col-span-3">
                  <motion.div
                    key={activeFeature}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="space-y-6"
                  >
                    <div className="aspect-[16/10] bg-gradient-to-br from-primary/5 to-muted rounded-2xl border border-border flex items-center justify-center overflow-hidden">
                      <div className="w-full h-full bg-gradient-to-br from-primary/10 to-muted/50 flex items-center justify-center">
                        <div className="text-center space-y-4">
                          {React.createElement(appIconMap[activeFeature], {
                            className: "h-20 w-20 text-primary mx-auto"
                          })}
                          <div className="text-muted-foreground font-medium text-lg">{t.home.applicationFeatures.items[activeFeature].imageTitle}</div>
                          <div className="text-sm text-muted-foreground/80">{t.home.common.demoInterface}</div>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 bg-muted/50 rounded-2xl">
                      <p className="text-muted-foreground leading-relaxed">
                        {t.home.applicationFeatures.items[activeFeature].description}
                      </p>
                    </div>
                  </motion.div>
                </div>
              </div>
            </div>

            {/* Technical advantage tip */}
            <motion.div 
              className="mt-20 text-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              viewport={{ once: true }}
            >
              <div className="inline-flex items-center space-x-2 px-6 py-3 bg-muted/50 rounded-full border border-border">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-chart-1 rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-chart-2 rounded-full animate-pulse animation-delay-2000"></div>
                  <div className="w-2 h-2 bg-chart-3 rounded-full animate-pulse animation-delay-4000"></div>
                </div>
                <span className="text-muted-foreground font-medium">{t.home.common.techArchitecture}</span>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-24 bg-background" ref={statsRef}>
          <div className="container px-4 md:px-6">
            <motion.div 
              className="text-center mb-16"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                {t.home.stats.title}
              </h2>
            </motion.div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <motion.div 
                className="text-center"
                initial={{ opacity: 0, scale: 0.5 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                viewport={{ once: true }}
              >
                <div className="text-4xl md:text-5xl font-bold text-foreground mb-2">
                  {stats.developers.toLocaleString()}+
                </div>
                <div className="text-muted-foreground">{t.home.stats.items.users}</div>
              </motion.div>
              
              <motion.div 
                className="text-center"
                initial={{ opacity: 0, scale: 0.5 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                viewport={{ once: true }}
              >
                <div className="text-4xl md:text-5xl font-bold text-foreground mb-2">
                  {stats.frameworks}
                </div>
                <div className="text-muted-foreground">{t.home.stats.items.frameworks}</div>
              </motion.div>
              
              <motion.div 
                className="text-center"
                initial={{ opacity: 0, scale: 0.5 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                viewport={{ once: true }}
              >
                <div className="text-4xl md:text-5xl font-bold text-foreground mb-2">
                  {stats.features}+
                </div>
                <div className="text-muted-foreground">{t.home.stats.items.features}</div>
              </motion.div>
              
              <motion.div 
                className="text-center"
                initial={{ opacity: 0, scale: 0.5 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                viewport={{ once: true }}
              >
                <div className="text-4xl md:text-5xl font-bold text-foreground mb-2">
                  {stats.satisfaction}%
                </div>
                <div className="text-muted-foreground">{t.home.stats.items.satisfaction}</div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="py-24 bg-muted/50">
          <div className="container px-4 md:px-6">
            <motion.div 
              className="text-center mb-16"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                {t.home.testimonials.title}
              </h2>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {t.home.testimonials.items.map((testimonial: any, index: number) => (
                <motion.div
                  key={index}
                  className="bg-card p-8 rounded-2xl border border-border hover:shadow-lg transition-all duration-300"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  viewport={{ once: true }}
                >
                  <div className="flex mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-5 w-5 text-chart-5 fill-current" />
                    ))}
                  </div>
                  <p className="text-muted-foreground mb-6 leading-relaxed">"{testimonial.quote}"</p>
                  <div className="flex items-center">
                    <div 
                      className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold mr-4 ${
                        index === 0 ? 'bg-chart-1' : 
                        index === 1 ? 'bg-chart-3' : 
                        'bg-chart-5'
                      }`}
                    >
                      {testimonial.author[0]}
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">{testimonial.author}</div>
                      <div className="text-muted-foreground text-sm">{testimonial.role}</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-24 bg-gradient-chart-warm text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-repeat opacity-10"></div>
          <div className="container px-4 md:px-6 relative z-10">
            <motion.div 
              className="text-center max-w-3xl mx-auto"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-5xl font-bold mb-6">
                {t.home.finalCta.title}
              </h2>
              <p className="text-xl text-primary-foreground/80 mb-8">
                {t.home.finalCta.subtitle}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button 
                  size="lg" 
                  className="px-8 py-4 text-lg rounded-full transition-all duration-300 hover:scale-105"
                >
                  {t.home.finalCta.buttons.purchase}
                </Button>
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="px-8 py-4 text-lg rounded-full transition-all duration-300 hover:scale-105"
                >
                  {t.home.finalCta.buttons.demo}
                </Button>
              </div>
            </motion.div>
          </div>
        </section>
      
        {/* Footer */}
        <footer className="py-12 bg-muted text-muted-foreground">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col md:flex-row justify-between items-center">
              <div className="flex items-center mb-4 md:mb-0">
                <Logo size="md" />
              </div>
              <div className="flex flex-col md:flex-row items-center space-y-4 md:space-y-0 md:space-x-6">
                <div className="text-muted-foreground text-center md:text-left">
                  {t.home.footer.copyright.replace('{year}', new Date().getFullYear().toString())}
                </div>
                <div className="flex space-x-4">
                  <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center hover:bg-muted/50 transition-colors cursor-pointer">
                    <span className="text-xs text-foreground">G</span>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center hover:bg-muted/50 transition-colors cursor-pointer">
                    <span className="text-xs text-foreground">T</span>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-background border border-border flex items-center justify-center hover:bg-muted/50 transition-colors cursor-pointer">
                    <span className="text-xs text-foreground">D</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
