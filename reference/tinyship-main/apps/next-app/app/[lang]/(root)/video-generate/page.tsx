'use client';

import { useState, useEffect } from 'react';
import { VideoIcon, DownloadIcon, RefreshCwIcon, ChevronDownIcon, ChevronUpIcon, ImagePlusIcon } from 'lucide-react';
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
import { getVideoSizesForProvider, getVideoDurationsForProvider } from '@libs/ai';

type VideoProviderName = 'fal' | 'volcengine' | 'aliyun';
type VideoInputMode = 'text' | 'firstFrame';

interface GenerationResult {
  videoUrl: string;
  duration?: number;
  provider: string;
  model: string;
  coverImageUrl?: string;
}

interface UploadResponse {
  success: boolean;
  data?: {
    url: string;
  };
  error?: string;
  message?: string;
}

interface AsyncVideoTaskData {
  taskId: string;
  status: 'processing';
  async: true;
  provider: string;
  model: string;
}

interface VideoGenerateResponse {
  success: boolean;
  data: GenerationResult | AsyncVideoTaskData;
  credits?: { remaining: number };
  message?: string;
  error?: string;
}

interface VideoTaskStatusResponse {
  success: boolean;
  data: {
    taskId: string;
    status: 'processing' | 'succeeded' | 'failed';
    result?: GenerationResult;
    error?: string;
  };
  credits?: { remaining: number };
}

const TASK_POLL_INTERVAL_MS = 3000;
const TASK_POLL_TIMEOUT_MS = 10 * 60 * 1000;

export default function VideoGeneratePage() {
  const { t, locale } = useTranslation();
  
  // Provider and model state
  const videoConfig = config.aiVideo;
  const [provider, setProvider] = useState<VideoProviderName>(videoConfig.defaultProvider as VideoProviderName);
  const [model, setModel] = useState<string>(videoConfig.defaultModels[videoConfig.defaultProvider as keyof typeof videoConfig.defaultModels]);
  
  // Form state
  const [prompt, setPrompt] = useState(t.ai.video.defaultPrompt);
  const [size, setSize] = useState<string>('');
  const [duration, setDuration] = useState<number>(videoConfig.defaults.duration);
  const [seed, setSeed] = useState<string>('random');
  const [loop, setLoop] = useState<boolean>(false);
  const [motionStrength, setMotionStrength] = useState<number>(0.8);
  const [promptExtend, setPromptExtend] = useState<boolean>(videoConfig.defaults.promptExtend);
  const [watermark, setWatermark] = useState<boolean>(videoConfig.defaults.watermark);
  const [inputMode, setInputMode] = useState<VideoInputMode>('text');
  const [firstFrameUrl, setFirstFrameUrl] = useState<string>('');
  const [isUploadingFirstFrame, setIsUploadingFirstFrame] = useState<boolean>(false);
  
  // UI state
  const [showSettings, setShowSettings] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>({
    videoUrl: 'https://static.tinyship.cn/video/ai-video.mp4',
    provider: videoConfig.defaultProvider,
    model: videoConfig.defaultModels[videoConfig.defaultProvider as keyof typeof videoConfig.defaultModels],
  });
  const [error, setError] = useState<string | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  
  // Get available sizes/aspect ratios for current provider
  const availableSizes = getVideoSizesForProvider(provider);
  const availableDurations = getVideoDurationsForProvider(provider);
  const providerDisplayOrder: VideoProviderName[] = ['volcengine', 'aliyun', 'fal'];
  
  // Update model and size when provider changes
  useEffect(() => {
    const defaultModel = videoConfig.defaultModels[provider as keyof typeof videoConfig.defaultModels];
    setModel(defaultModel);
    // Set default size for the provider
    const sizes = getVideoSizesForProvider(provider);
    if (sizes.length > 0) {
      const defaultSize = sizes.find((s: { value: string }) => s.value.includes('16:9') || s.value.includes('1280'));
      setSize(defaultSize?.value || sizes[0].value);
    }
    // Set default duration
    const durations = getVideoDurationsForProvider(provider);
    if (durations.length > 0) {
      setDuration(durations[0]);
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

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const pollVideoTask = async (taskId: string): Promise<GenerationResult> => {
    const start = Date.now();

    while (Date.now() - start < TASK_POLL_TIMEOUT_MS) {
      const response = await fetch(`/api/video-generate/status?taskId=${encodeURIComponent(taskId)}`);
      const data = await response.json() as VideoTaskStatusResponse;

      if (!response.ok) {
        throw new Error((data as any)?.message || t.ai.video.errors.generationFailed);
      }

      if (data.credits?.remaining !== undefined) {
        setCreditBalance(data.credits.remaining);
      }

      if (data.data.status === 'succeeded' && data.data.result) {
        return data.data.result;
      }

      if (data.data.status === 'failed') {
        throw new Error(data.data.error || t.ai.video.errors.generationFailed);
      }

      await sleep(TASK_POLL_INTERVAL_MS);
    }

    throw new Error(t.ai.video.errors.timeout);
  };
  
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error(t.ai.video.errors.invalidPrompt);
      return;
    }

    if (inputMode !== 'text' && !firstFrameUrl.trim()) {
      toast.error(t.ai.video.errors.firstFrameRequired);
      return;
    }
    setIsGenerating(true);
    setError(null);
    setResult(null);
    
    try {
      const response = await fetch('/api/video-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          provider,
          model,
          size: provider === 'fal' ? undefined : size,
          aspectRatio: provider === 'fal' ? size : undefined,
          duration,
          seed: seed === 'random' ? undefined : parseInt(seed, 10),
          loop: provider === 'fal' ? loop : undefined,
          motionStrength: provider === 'fal' ? motionStrength : undefined,
          promptExtend: provider === 'aliyun' ? promptExtend : undefined,
          watermark: provider === 'aliyun' || provider === 'volcengine' ? watermark : undefined,
          firstFrameUrl: inputMode !== 'text' ? (firstFrameUrl.trim() || undefined) : undefined,
        }),
      });
      
      const data = await response.json() as VideoGenerateResponse;
      
      if (!response.ok) {
        if (response.status === 402) {
          toast.error(t.ai.video.errors.insufficientCredits, {
            description: t.ai.video.errors.insufficientCreditsDescription,
            action: {
              label: t.common?.viewPlans || 'View Plans',
              onClick: () => { window.location.href = `/${locale}/pricing`; }
            }
          });
          return;
        }
        throw new Error(data.message || t.ai.video.errors.generationFailed);
      }
      
      if (data.credits?.remaining !== undefined) {
        setCreditBalance(data.credits.remaining);
      }

      const maybeTask = data.data as Partial<AsyncVideoTaskData>;
      if (maybeTask.taskId) {
        const finalResult = await pollVideoTask(maybeTask.taskId);
        setResult(finalResult);
      } else {
        setResult(data.data as GenerationResult);
      }
      toast.success(t.ai.video.generatedSuccessfully);
      
    } catch (err) {
      const message = err instanceof Error ? err.message : t.ai.video.errors.unknownError;
      setError(message);
      toast.error(t.ai.video.errors.generationFailed, { description: message });
    } finally {
      setIsGenerating(false);
    }
  };
  
  const handleDownload = async () => {
    if (!result?.videoUrl) return;
    
    try {
      const response = await fetch(result.videoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `video-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      // If fetch fails (e.g., CORS), open in new tab
      window.open(result.videoUrl, '_blank');
    }
  };
  
  const randomizeSeed = () => {
    setSeed(Math.floor(Math.random() * 2147483647).toString());
  };

  const uploadFrameFile = async (file: File) => {
    const isValidImageType = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/bmp'].includes(file.type);
    if (!isValidImageType) {
      toast.error(t.ai.video.errors.unsupportedImageType);
      return;
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(t.ai.video.errors.imageTooLarge);
      return;
    }

    setIsUploadingFirstFrame(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('provider', 'r2');

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json() as UploadResponse;

      if (!response.ok || !data.success || !data.data?.url) {
        throw new Error(data.error || data.message || t.ai.video.errors.uploadFailed);
      }

      setFirstFrameUrl(data.data.url);
      toast.success(t.ai.video.frameInput.uploadedToR2);
    } catch (err) {
      const message = err instanceof Error ? err.message : t.ai.video.errors.uploadFailed;
      toast.error(message);
    } finally {
      setIsUploadingFirstFrame(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      {/* Left Panel - Input Form */}
      <div className="w-full lg:w-1/2 border-r border-border bg-background p-6 overflow-y-auto">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{t.ai.video.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">{t.ai.video.description}</p>
            </div>
            {creditBalance !== null && (
              <div className="text-sm text-muted-foreground">
                {t.ai.video.credits}: <span className="font-semibold text-foreground">{creditBalance}</span>
              </div>
            )}
          </div>
          
          {/* Provider & Model Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t.ai.video.providers.title}</Label>
              <Select value={provider} onValueChange={(v: string) => setProvider(v as VideoProviderName)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providerDisplayOrder.map((p) => (
                    <SelectItem key={p} value={p}>
                      {t.ai.video.providers[p as keyof typeof t.ai.video.providers] || p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>{t.ai.video.model}</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(videoConfig.availableModels[provider as keyof typeof videoConfig.availableModels] || []).map((m: string) => (
                    <SelectItem key={m} value={m}>
                      {(t.ai.video.models as Record<string, string>)[m] || m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Prompt */}
          <div className="space-y-2">
            <Label>{t.ai.video.prompt}</Label>
            <Textarea
              value={prompt}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
              placeholder={t.ai.video.promptPlaceholder}
              className="min-h-[120px] resize-y"
            />
          </div>

          <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
            <div className="space-y-2">
              <Label>{t.ai.video.inputMode.label}</Label>
              <Select value={inputMode} onValueChange={(v: string) => setInputMode(v as VideoInputMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">{t.ai.video.inputMode.text}</SelectItem>
                  <SelectItem value="firstFrame">{t.ai.video.inputMode.firstFrame}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {inputMode !== 'text' && (
              <div className="space-y-3">
                <div>
                  <Label>{t.ai.video.frameInput.title}</Label>
                  <p className="text-xs text-muted-foreground">{t.ai.video.frameInput.hint}</p>
                </div>

                <div className="space-y-2">
                  <Label>{t.ai.video.frameInput.firstFrameUrl}</Label>
                  <div className="flex gap-2">
                    <Input
                      value={firstFrameUrl}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFirstFrameUrl(e.target.value)}
                      placeholder="https://..."
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isUploadingFirstFrame}
                      onClick={() => document.getElementById('first-frame-upload')?.click()}
                    >
                      {isUploadingFirstFrame ? <RefreshCwIcon className="h-4 w-4 animate-spin" /> : <ImagePlusIcon className="h-4 w-4" />}
                      <span className="ml-2">{t.ai.video.frameInput.upload}</span>
                    </Button>
                    <input
                      id="first-frame-upload"
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.bmp"
                      className="hidden"
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const file = e.target.files?.[0];
                        if (file) {
                            void uploadFrameFile(file);
                        }
                        e.currentTarget.value = '';
                      }}
                    />
                  </div>
                </div>

                {firstFrameUrl.trim() && (
                  <div className="space-y-2">
                    <Label>{t.ai.video.frameInput.preview}</Label>
                    <div className="rounded-md border bg-muted/20 p-2">
                      <img
                        src={firstFrameUrl}
                        alt={t.ai.video.frameInput.previewAlt}
                        className="h-48 w-full rounded object-contain"
                      />
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
          
          {/* Additional Settings Toggle */}
          <div>
            <Button
              variant="ghost"
              className="w-full justify-between"
              onClick={() => setShowSettings(!showSettings)}
            >
              <span>{t.ai.video.settings.title}</span>
              {showSettings ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
            </Button>
          </div>
          
          {/* Additional Settings */}
          {showSettings && (
            <div className="space-y-6 border rounded-lg p-4 bg-muted/30">
              {/* Video Size / Aspect Ratio */}
              <div className="space-y-2">
                <Label>{t.ai.video.settings.videoSize}</Label>
                <Select value={size} onValueChange={setSize}>
                  <SelectTrigger>
                    <SelectValue placeholder={t.ai.video.settings.videoSizePlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSizes.map((s: { value: string; label: string }) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t.ai.video.settings.videoSizeHint}</p>
              </div>
              
              {/* Duration */}
              <div className="space-y-2">
                <Label>{t.ai.video.settings.duration}</Label>
                <Select value={duration.toString()} onValueChange={(v: string) => setDuration(parseInt(v, 10))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDurations.map((d: number) => (
                      <SelectItem key={d} value={d.toString()}>
                        {d}s
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t.ai.video.settings.durationHint}</p>
              </div>
              
              {/* Fal-specific settings */}
              {provider === 'fal' && (
                <>
                  {/* Motion Strength */}
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>{t.ai.video.settings.motionStrength}</Label>
                      <span className="text-sm text-muted-foreground">{motionStrength}</span>
                    </div>
                    <Slider
                      value={[motionStrength]}
                      onValueChange={([v]: number[]) => setMotionStrength(v)}
                      min={0}
                      max={1}
                      step={0.1}
                    />
                    <p className="text-xs text-muted-foreground">{t.ai.video.settings.motionStrengthHint}</p>
                  </div>
                  
                  {/* Loop */}
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t.ai.video.settings.loop}</Label>
                      <p className="text-xs text-muted-foreground">{t.ai.video.settings.loopHint}</p>
                    </div>
                    <Switch checked={loop} onCheckedChange={setLoop} />
                  </div>
                </>
              )}
              
              {/* Seed */}
              <div className="space-y-2">
                <Label>{t.ai.video.settings.seed}</Label>
                <div className="flex gap-2">
                  <Input
                    value={seed}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSeed(e.target.value)}
                    placeholder={t.ai.video.settings.random}
                    className="flex-1"
                  />
                  <Button variant="outline" size="icon" onClick={randomizeSeed}>
                    <RefreshCwIcon className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t.ai.video.settings.seedHint}</p>
              </div>
              
              {/* Aliyun + Volcengine settings */}
              {(provider === 'aliyun' || provider === 'volcengine') && (
                <>
                  {provider === 'aliyun' && (
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>{t.ai.video.settings.promptExtend}</Label>
                        <p className="text-xs text-muted-foreground">{t.ai.video.settings.promptExtendHint}</p>
                      </div>
                      <Switch checked={promptExtend} onCheckedChange={setPromptExtend} />
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>{t.ai.video.settings.watermark}</Label>
                      <p className="text-xs text-muted-foreground">{t.ai.video.settings.watermarkHint}</p>
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
                {t.ai.video.generating}
              </>
            ) : (
              <>
                <VideoIcon className="mr-2 h-4 w-4" />
                {t.ai.video.generate}
              </>
            )}
          </Button>
        </div>
      </div>
      
      {/* Right Panel - Result */}
      <div className="w-full lg:w-1/2 bg-muted/30 p-6 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{t.ai.video.result}</h2>
            <span className="text-xs bg-muted px-2 py-1 rounded">
              {isGenerating ? t.ai.video.generating : (result ? t.ai.video.generatedSuccessfully : t.ai.video.idle)}
            </span>
          </div>
        </div>
        
        {/* Result Display */}
        <div className="flex-1 flex items-center justify-center bg-background rounded-lg border border-border min-h-[400px] relative overflow-hidden">
          {isGenerating ? (
            <div className="flex flex-col items-center gap-4">
              <RefreshCwIcon className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">{t.ai.video.generating}</p>
              <p className="text-xs text-muted-foreground">
                {t.ai.video.resultPanel.generatingHint}
              </p>
            </div>
          ) : result ? (
            <video
              src={result.videoUrl}
              controls
              autoPlay
              loop
              className="max-w-full max-h-full object-contain"
              poster={result.coverImageUrl}
            >
              {t.ai.video.resultPanel.videoTagUnsupported}
            </video>
          ) : error ? (
            <div className="text-center text-destructive">
              <p className="font-medium">{t.ai.video.errors.generationFailed}</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          ) : (
            <div className="text-center text-muted-foreground">
              <VideoIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t.ai.video.idle}</p>
            </div>
          )}
        </div>
        
        {/* Actions */}
        {result && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">{t.ai.video.whatNext}</p>
            <Button onClick={handleDownload} className="w-full">
              <DownloadIcon className="mr-2 h-4 w-4" />
              {t.ai.video.download}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
