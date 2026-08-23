import { createFileRoute } from '@tanstack/react-router'
import { seoHead } from '@/lib/seo'
import { useState, useEffect } from 'react'
import { ImageIcon, DownloadIcon, RefreshCwIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from '@/hooks/use-translation'
import { Button } from '@libs/react-shared/ui/button'
import { Textarea } from '@libs/react-shared/ui/textarea'
import { Label } from '@libs/react-shared/ui/label'
import { Input } from '@libs/react-shared/ui/input'
import { Switch } from '@libs/react-shared/ui/switch'
import { Slider } from '@libs/react-shared/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@libs/react-shared/ui/select'
import { config } from '@config'
import { getImageSizesForProvider } from '@libs/ai'

export const Route = createFileRoute('/$lang/(root)/image-generate')({
  head: ({ params }) => seoHead(params.lang, (t) => t.ai.image.metadata),
  component: ImageGeneratePage,
})

type ImageProviderName = 'qwen' | 'fal' | 'openai' | 'gemini'
interface GenerationResult { imageUrl: string; width?: number; height?: number; provider: string; model: string; seed?: number }

function ImageGeneratePage() {
  const { t, locale } = useTranslation()
  const imageConfig = config.aiImage
  const [provider, setProvider] = useState<ImageProviderName>(imageConfig.defaultProvider as ImageProviderName)
  const [model, setModel] = useState<string>(imageConfig.defaultModels[imageConfig.defaultProvider as keyof typeof imageConfig.defaultModels])
  const [prompt, setPrompt] = useState(t.ai.image.defaultPrompt)
  const [negativePrompt, setNegativePrompt] = useState('')
  const [size, setSize] = useState<string>('')
  const [numInferenceSteps, setNumInferenceSteps] = useState<number>(imageConfig.defaults.numInferenceSteps)
  const [guidanceScale, setGuidanceScale] = useState<number>(imageConfig.defaults.guidanceScale)
  const [seed, setSeed] = useState<string>('random')
  const [promptExtend, setPromptExtend] = useState<boolean>(imageConfig.defaults.promptExtend)
  const [watermark, setWatermark] = useState<boolean>(imageConfig.defaults.watermark)
  const [showSettings, setShowSettings] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<GenerationResult | null>({ imageUrl: 'https://static.tinyship.cn/images/image-demo2.png', provider: imageConfig.defaultProvider, model: imageConfig.defaultModels[imageConfig.defaultProvider as keyof typeof imageConfig.defaultModels] })
  const [error, setError] = useState<string | null>(null)
  const [creditBalance, setCreditBalance] = useState<number | null>(null)

  const availableSizes = getImageSizesForProvider(provider)

  useEffect(() => {
    const defaultModel = imageConfig.defaultModels[provider as keyof typeof imageConfig.defaultModels]
    setModel(defaultModel)
    if (availableSizes.length > 0) {
      const defaultSize = availableSizes.find((s: { value: string }) => s.value.includes('1:1') || s.value.includes('1328'))
      setSize(defaultSize?.value || availableSizes[0].value)
    }
  }, [provider])

  useEffect(() => { checkCreditBalance() }, [])
  const checkCreditBalance = async () => { try { const r = await fetch('/api/credits/status'); const d = await r.json(); setCreditBalance(d?.credits?.balance || 0) } catch {} }

  const handleGenerate = async () => {
    if (!prompt.trim()) { toast.error(t.ai.image.errors.invalidPrompt); return }
    setIsGenerating(true); setError(null)
    try {
      const selectedAspectRatio = (provider === 'fal' || provider === 'gemini') ? (size || '1:1') : undefined
      const response = await fetch('/api/image-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(), provider, model, negativePrompt: negativePrompt.trim() || undefined,
          size: (provider === 'fal' || provider === 'gemini') ? undefined : (size || undefined),
          aspectRatio: selectedAspectRatio, seed: seed === 'random' ? undefined : parseInt(seed, 10),
          promptExtend: provider === 'qwen' ? promptExtend : undefined, watermark: provider === 'qwen' ? watermark : undefined,
          numInferenceSteps: provider === 'fal' ? numInferenceSteps : undefined, guidanceScale: provider === 'fal' ? guidanceScale : undefined,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        if (response.status === 402) {
          toast.error(t.ai.image.errors.insufficientCredits, { description: t.ai.image.errors.insufficientCreditsDescription, action: { label: t.common?.viewPlans || 'View Plans', onClick: () => { window.location.href = `/${locale}/pricing` } } })
          return
        }
        throw new Error(data.message || t.ai.image.errors.generationFailed)
      }
      setResult(data.data); setCreditBalance(data.credits?.remaining)
      toast.success(t.ai.image.generatedSuccessfully)
    } catch (err) {
      const message = err instanceof Error ? err.message : t.ai.image.errors.unknownError
      setError(message); toast.error(t.ai.image.errors.generationFailed, { description: message })
    } finally { setIsGenerating(false) }
  }

  const handleDownload = async () => {
    if (!result?.imageUrl) return
    try { const r = await fetch(result.imageUrl); const b = await r.blob(); const u = window.URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `image-${Date.now()}.png`; document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(u) }
    catch { window.open(result.imageUrl, '_blank') }
  }

  const randomizeSeed = () => setSeed(Math.floor(Math.random() * 2147483647).toString())

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="border-border bg-background w-full overflow-y-auto border-r p-6 lg:w-1/2">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="flex items-center justify-between">
            <div><h1 className="text-2xl font-bold">{t.ai.image.title}</h1><p className="text-muted-foreground mt-1 text-sm">{t.ai.image.description}</p></div>
            {creditBalance !== null && <div className="text-muted-foreground text-sm">{t.ai.image.credits}: <span className="text-foreground font-semibold">{creditBalance}</span></div>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>{t.ai.image.providers.title}</Label><Select value={provider} onValueChange={(v) => setProvider(v as ImageProviderName)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.keys(imageConfig.availableModels).map((p) => <SelectItem key={p} value={p}>{t.ai.image.providers[p as keyof typeof t.ai.image.providers] || p}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Model</Label><Select value={model} onValueChange={setModel}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(imageConfig.availableModels[provider as keyof typeof imageConfig.availableModels] || []).map((m: string) => <SelectItem key={m} value={m}>{(t.ai.image.models as Record<string, string>)[m] || m}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="space-y-2"><Label>{t.ai.image.prompt}</Label><Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t.ai.image.promptPlaceholder} className="min-h-[120px] resize-y" /></div>
          <div><Button variant="ghost" className="w-full justify-between" onClick={() => setShowSettings(!showSettings)}><span>{t.ai.image.settings.title}</span>{showSettings ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}</Button></div>
          {showSettings && (
            <div className="bg-muted/30 space-y-6 rounded-lg border p-4">
              <div className="space-y-2"><Label>{t.ai.image.negativePrompt}</Label><Textarea value={negativePrompt} onChange={(e) => setNegativePrompt(e.target.value)} placeholder={t.ai.image.negativePromptPlaceholder} className="min-h-[80px] resize-y" /><p className="text-muted-foreground text-xs">{t.ai.image.negativePromptHint}</p></div>
              <div className="space-y-2"><Label>{t.ai.image.settings.imageSize}</Label><Select value={size} onValueChange={setSize}><SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger><SelectContent>{availableSizes.map((s: { value: string; label: string }) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
              {provider === 'fal' && (
                <>
                  <div className="space-y-2"><div className="flex justify-between"><Label>{t.ai.image.settings.numInferenceSteps}</Label><span className="text-muted-foreground text-sm">{numInferenceSteps}</span></div><Slider value={[numInferenceSteps]} onValueChange={([v]) => setNumInferenceSteps(v)} min={1} max={50} step={1} /><p className="text-muted-foreground text-xs">{t.ai.image.settings.numInferenceStepsHint}</p></div>
                  <div className="space-y-2"><div className="flex justify-between"><Label>{t.ai.image.settings.guidanceScale}</Label><span className="text-muted-foreground text-sm">{guidanceScale}</span></div><Slider value={[guidanceScale]} onValueChange={([v]) => setGuidanceScale(v)} min={1} max={20} step={0.5} /><p className="text-muted-foreground text-xs">{t.ai.image.settings.guidanceScaleHint}</p></div>
                </>
              )}
              <div className="space-y-2"><Label>{t.ai.image.settings.seed}</Label><div className="flex gap-2"><Input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder={t.ai.image.settings.random} className="flex-1" /><Button variant="outline" size="icon" onClick={randomizeSeed}><RefreshCwIcon className="h-4 w-4" /></Button></div><p className="text-muted-foreground text-xs">{t.ai.image.settings.seedHint}</p></div>
              {provider === 'qwen' && (
                <>
                  <div className="flex items-center justify-between"><div><Label>{t.ai.image.settings.promptExtend}</Label><p className="text-muted-foreground text-xs">{t.ai.image.settings.promptExtendHint}</p></div><Switch checked={promptExtend} onCheckedChange={setPromptExtend} /></div>
                  <div className="flex items-center justify-between"><div><Label>{t.ai.image.settings.watermark}</Label><p className="text-muted-foreground text-xs">{t.ai.image.settings.watermarkHint}</p></div><Switch checked={watermark} onCheckedChange={setWatermark} /></div>
                </>
              )}
            </div>
          )}
          <Button className="w-full" size="lg" onClick={handleGenerate} disabled={isGenerating || !prompt.trim()}>
            {isGenerating ? <><RefreshCwIcon className="mr-2 h-4 w-4 animate-spin" />{t.ai.image.generating}</> : <><ImageIcon className="mr-2 h-4 w-4" />{t.ai.image.generate}</>}
          </Button>
        </div>
      </div>
      <div className="bg-muted/30 flex w-full flex-col p-6 lg:w-1/2">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{t.ai.image.result}</h2><span className="bg-muted rounded px-2 py-1 text-xs">{isGenerating ? t.ai.image.generating : t.ai.image.idle}</span></div>
        </div>
        <div className="border-border bg-background relative flex min-h-[400px] flex-1 items-center justify-center overflow-hidden rounded-lg border">
          {isGenerating ? <div className="flex flex-col items-center gap-4"><RefreshCwIcon className="text-primary h-8 w-8 animate-spin" /><p className="text-muted-foreground">{t.ai.image.generating}</p></div>
          : result ? <img src={result.imageUrl} alt="Generated image" className="max-h-full max-w-full object-contain" />
          : error ? <div className="text-destructive text-center"><p className="font-medium">{t.ai.image.errors.generationFailed}</p><p className="mt-1 text-sm">{error}</p></div>
          : <div className="text-muted-foreground text-center"><ImageIcon className="mx-auto mb-4 h-12 w-12 opacity-50" /><p>{t.ai.image.idle}</p></div>}
        </div>
        {result && <div className="mt-4 space-y-4"><p className="text-muted-foreground text-sm">{t.ai.image.whatNext}</p><Button onClick={handleDownload} className="w-full"><DownloadIcon className="mr-2 h-4 w-4" />{t.ai.image.download}</Button></div>}
      </div>
    </div>
  )
}
