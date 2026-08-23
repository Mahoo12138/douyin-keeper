'use client';

import { useState, useEffect } from 'react';
import { ImageIcon, DownloadIcon, RefreshCwIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@libs/react-shared/ui/button';
import { Textarea } from '@libs/react-shared/ui/textarea';
import { Label } from '@libs/react-shared/ui/label';
import { Input } from '@libs/react-shared/ui/input';
import { Switch } from '@libs/react-shared/ui/switch';
import { Slider } from '@libs/react-shared/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@libs/react-shared/ui/select';
import { config } from '@config';
import { getImageSizesForProvider } from '@libs/ai';

type ImageProviderName = 'qwen' | 'fal' | 'openai' | 'gemini';

interface GenerationResult {
  imageUrl: string;
  width?: number;
  height?: number;
  provider: string;
  model: string;
  seed?: number;
}

export default function ImageGeneratePage() {
  const { t, locale } = useTranslation();
  
  // Provider and model state
  const imageConfig = config.aiImage;
  const [provider, setProvider] = useState<ImageProviderName>(imageConfig.defaultProvider as ImageProviderName);
  const [model, setModel] = useState<string>(imageConfig.defaultModels[imageConfig.defaultProvider as keyof typeof imageConfig.defaultModels]);
  
  // Form state
  const [prompt, setPrompt] = useState(t.ai.image.defaultPrompt);
  const [negativePrompt, setNegativePrompt] = useState('');
  const [size, setSize] = useState<string>('');
  const [numInferenceSteps, setNumInferenceSteps] = useState<number>(imageConfig.defaults.numInferenceSteps);
  const [guidanceScale, setGuidanceScale] = useState<number>(imageConfig.defaults.guidanceScale);
  const [seed, setSeed] = useState<string>('random');
  const [promptExtend, setPromptExtend] = useState<boolean>(imageConfig.defaults.promptExtend);
  const [watermark, setWatermark] = useState<boolean>(imageConfig.defaults.watermark);
  
  // UI state
  const [showSettings, setShowSettings] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>({
    imageUrl: 'https://static.tinyship.cn/images/image-demo2.png',
    provider: imageConfig.defaultProvider,
    model: imageConfig.defaultModels[imageConfig.defaultProvider as keyof typeof imageConfig.defaultModels],
  });
  const [error, setError] = useState<string | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  
  // Get available sizes/aspect ratios for current provider
  const availableSizes = getImageSizesForProvider(provider);
  
  // Update model when provider changes
  useEffect(() => {
    const defaultModel = imageConfig.defaultModels[provider as keyof typeof imageConfig.defaultModels];
    setModel(defaultModel);
    // Set default size for the provider
    if (availableSizes.length > 0) {
      const defaultSize = availableSizes.find((s: { value: string }) => s.value.includes('1:1') || s.value.includes('1328'));
      setSize(defaultSize?.value || availableSizes[0].value);
    }
  }, [provider]);
  
  // Check credit balance on mount
  useEffect(() => {
    checkCreditBalance();
  }, []);
  
  const checkCreditBalance = async () => {
    try {
      const response = await fetch('/api/credits/status');
      const data = await response.json();
      setCreditBalance(data?.credits?.balance || 0);
    } catch (err) {
      console.error('Failed to check credit balance:', err);
    }
  };
  
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error(t.ai.image.errors.invalidPrompt);
      return;
    }
    
    setIsGenerating(true);
    setError(null);
    
    try {
      const selectedAspectRatio = (provider === 'fal' || provider === 'gemini')
        ? (size || '1:1')
        : undefined;

      const response = await fetch('/api/image-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          provider,
          model,
          negativePrompt: negativePrompt.trim() || undefined,
          size: (provider === 'fal' || provider === 'gemini') ? undefined : (size || undefined),
          aspectRatio: selectedAspectRatio,
          seed: seed === 'random' ? undefined : parseInt(seed, 10),
          promptExtend: provider === 'qwen' ? promptExtend : undefined,
          watermark: provider === 'qwen' ? watermark : undefined,
          numInferenceSteps: provider === 'fal' ? numInferenceSteps : undefined,
          guidanceScale: provider === 'fal' ? guidanceScale : undefined,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        if (response.status === 402) {
          toast.error(t.ai.image.errors.insufficientCredits, {
            description: t.ai.image.errors.insufficientCreditsDescription,
            action: {
              label: t.common?.viewPlans || 'View Plans',
              onClick: () => { window.location.href = `/${locale}/pricing`; }
            }
          });
          return;
        }
        throw new Error(data.message || t.ai.image.errors.generationFailed);
      }
      
      setResult(data.data);
      setCreditBalance(data.credits?.remaining);
      toast.success(t.ai.image.generatedSuccessfully);
      
    } catch (err) {
      const message = err instanceof Error ? err.message : t.ai.image.errors.unknownError;
      setError(message);
      toast.error(t.ai.image.errors.generationFailed, { description: message });
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleDownload = async () => {
    if (!result?.imageUrl) return;
    
    try {
      const response = await fetch(result.imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `image-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      // If fetch fails (e.g., CORS), open in new tab
      window.open(result.imageUrl, '_blank');
    }
  };
  
  const randomizeSeed = () => {
    setSeed(Math.floor(Math.random() * 2147483647).toString());
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      {/* Left Panel - Input Form */}
      <div className="w-full lg:w-1/2 border-r border-border bg-background p-6 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{t.ai.image.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">{t.ai.image.description}</p>
            </div>
            {creditBalance !== null && (
              <div className="text-sm text-muted-foreground">
                {t.ai.image.credits}: <span className="font-semibold text-foreground">{creditBalance}</span>
              </div>
            )}
          </div>
          
          {/* Provider & Model Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t.ai.image.providers.title}</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as ImageProviderName)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(imageConfig.availableModels).map((p) => (
                    <SelectItem key={p} value={p}>
                      {t.ai.image.providers[p as keyof typeof t.ai.image.providers] || p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(imageConfig.availableModels[provider as keyof typeof imageConfig.availableModels] || []).map((m: string) => (
                    <SelectItem key={m} value={m}>
                      {(t.ai.image.models as Record<string, string>)[m] || m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Prompt */}
          <div className="space-y-2">
            <Label>{t.ai.image.prompt}</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t.ai.image.promptPlaceholder}
              className="min-h-[120px] resize-y"
            />
          </div>
          
          {/* Additional Settings Toggle */}
          <div>
            <Button
              variant="ghost"
              className="w-full justify-between"
              onClick={() => setShowSettings(!showSettings)}
            >
              <span>{t.ai.image.settings.title}</span>
              {showSettings ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
            </Button>
          </div>
          
          {/* Additional Settings */}
          {showSettings && (
            <div className="space-y-6 border rounded-lg p-4 bg-muted/30">
              {/* Negative Prompt */}
              <div className="space-y-2">
                <Label>{t.ai.image.negativePrompt}</Label>
                <Textarea
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder={t.ai.image.negativePromptPlaceholder}
                  className="min-h-[80px] resize-y"
                />
                <p className="text-xs text-muted-foreground">{t.ai.image.negativePromptHint}</p>
              </div>
              
              {/* Image Size */}
              <div className="space-y-2">
                <Label>{t.ai.image.settings.imageSize}</Label>
                <Select value={size} onValueChange={setSize}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSizes.map((s: { value: string; label: string }) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Fal-specific settings */}
              {provider === 'fal' && (
                <>
                  {/* Inference Steps */}
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>{t.ai.image.settings.numInferenceSteps}</Label>
                      <span className="text-sm text-muted-foreground">{numInferenceSteps}</span>
                    </div>
                    <Slider
                      value={[numInferenceSteps]}
                      onValueChange={([v]) => setNumInferenceSteps(v)}
                      min={1}
                      max={50}
                      step={1}
                    />
                    <p className="text-xs text-muted-foreground">{t.ai.image.settings.numInferenceStepsHint}</p>
                  </div>
                  
                  {/* Guidance Scale */}
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>{t.ai.image.settings.guidanceScale}</Label>
                      <span className="text-sm text-muted-foreground">{guidanceScale}</span>
                    </div>
                    <Slider
                      value={[guidanceScale]}
                      onValueChange={([v]) => setGuidanceScale(v)}
                      min={1}
                      max={20}
                      step={0.5}
                    />
                    <p className="text-xs text-muted-foreground">{t.ai.image.settings.guidanceScaleHint}</p>
                  </div>
                </>
              )}
              
              {/* Seed */}
              <div className="space-y-2">
                <Label>{t.ai.image.settings.seed}</Label>
                <div className="flex gap-2">
                  <Input
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    placeholder={t.ai.image.settings.random}
                    className="flex-1"
                  />
                  <Button variant="outline" size="icon" onClick={randomizeSeed}>
                    <RefreshCwIcon className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t.ai.image.settings.seedHint}</p>
              </div>
              
              {/* Qwen-specific settings */}
              {provider === 'qwen' && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t.ai.image.settings.promptExtend}</Label>
                      <p className="text-xs text-muted-foreground">{t.ai.image.settings.promptExtendHint}</p>
                    </div>
                    <Switch checked={promptExtend} onCheckedChange={setPromptExtend} />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t.ai.image.settings.watermark}</Label>
                      <p className="text-xs text-muted-foreground">{t.ai.image.settings.watermarkHint}</p>
                    </div>
                    <Switch checked={watermark} onCheckedChange={setWatermark} />
                  </div>
                </>
              )}
            </div>
          )}
          
          {/* Generate Button */}
          <Button
            className="w-full"
            size="lg"
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
          >
            {isGenerating ? (
              <>
                <RefreshCwIcon className="mr-2 h-4 w-4 animate-spin" />
                {t.ai.image.generating}
              </>
            ) : (
              <>
                <ImageIcon className="mr-2 h-4 w-4" />
                {t.ai.image.generate}
              </>
            )}
          </Button>
        </div>
      </div>
      
      {/* Right Panel - Result */}
      <div className="w-full lg:w-1/2 bg-muted/30 p-6 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{t.ai.image.result}</h2>
            <span className="text-xs bg-muted px-2 py-1 rounded">
              {isGenerating ? t.ai.image.generating : t.ai.image.idle}
            </span>
          </div>
        </div>
        
        {/* Result Display */}
        <div className="flex-1 flex items-center justify-center bg-background rounded-lg border border-border min-h-[400px] relative overflow-hidden">
          {isGenerating ? (
            <div className="flex flex-col items-center gap-4">
              <RefreshCwIcon className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">{t.ai.image.generating}</p>
            </div>
          ) : result ? (
            <img
              src={result.imageUrl}
              alt="Generated image"
              className="max-w-full max-h-full object-contain"
            />
          ) : error ? (
            <div className="text-center text-destructive">
              <p className="font-medium">{t.ai.image.errors.generationFailed}</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          ) : (
            <div className="text-center text-muted-foreground">
              <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t.ai.image.idle}</p>
            </div>
          )}
        </div>
        
        {/* Actions */}
        {result && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">{t.ai.image.whatNext}</p>
            <Button onClick={handleDownload} className="w-full">
              <DownloadIcon className="mr-2 h-4 w-4" />
              {t.ai.image.download}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
