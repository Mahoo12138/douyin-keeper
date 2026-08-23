'use client'

import { use, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/hooks/use-translation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@libs/react-shared/ui/card'
import { Button } from '@libs/react-shared/ui/button'
import { Input } from '@libs/react-shared/ui/input'
import { Label } from '@libs/react-shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@libs/react-shared/ui/select'
import { Switch } from '@libs/react-shared/ui/switch'
import { Textarea } from '@libs/react-shared/ui/textarea'
import { Separator } from '@libs/react-shared/ui/separator'
import { ArrowLeft, Save, Loader2, Info } from 'lucide-react'
import { locales as supportedLocales, defaultLocale, getLocaleLabel } from '@libs/i18n'
import { featuresToMarkdown } from '@libs/pricing/types'
import Link from 'next/link'

interface I18nFields {
  name: string
  description: string
  duration: string
  features: string
}

const EMPTY_I18N: I18nFields = { name: '', description: '', duration: '', features: '' }

const PROVIDERS = ['stripe', 'wechat', 'alipay', 'paypal', 'creem', 'dodo']
const CURRENCIES = ['USD', 'CNY', 'EUR', 'GBP', 'JPY']
const DURATION_TYPES = ['recurring', 'one_time', 'credits']

const PROVIDER_ID_FIELDS: Record<string, { field: string; key: string; placeholder: string } | null> = {
  stripe: { field: 'stripePriceId', key: 'stripePriceId', placeholder: 'price_xxx' },
  paypal: { field: 'paypalPlanId', key: 'paypalPlanId', placeholder: 'P-xxx' },
  creem: { field: 'creemProductId', key: 'creemProductId', placeholder: 'prod_xxx' },
  dodo: { field: 'dodoProductId', key: 'dodoProductId', placeholder: 'pdt_xxx' },
  wechat: null,
  alipay: null,
}

export default function PricingFormPage({ params }: { params: Promise<{ id: string; lang: string }> }) {
  const { id, lang } = use(params)
  const isNew = id === 'new'
  const router = useRouter()
  const { t } = useTranslation()
  const tp = t.admin?.pricing

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [activeLocale, setActiveLocale] = useState<string>(defaultLocale)

  const [provider, setProvider] = useState('stripe')
  const [amount, setAmount] = useState('')
  const [originalPrice, setOriginalPrice] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [durationType, setDurationType] = useState('one_time')
  const [durationMonths, setDurationMonths] = useState('1')
  const [credits, setCredits] = useState('')
  const [recommended, setRecommended] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [locales, setLocales] = useState('')
  const [stripePriceId, setStripePriceId] = useState('')
  const [paypalPlanId, setPaypalPlanId] = useState('')
  const [creemProductId, setCreemProductId] = useState('')
  const [dodoProductId, setDodoProductId] = useState('')

  const [i18nData, setI18nData] = useState<Record<string, I18nFields>>(() =>
    Object.fromEntries(supportedLocales.map(loc => [loc, { ...EMPTY_I18N }]))
  )

  const updateI18nField = (locale: string, field: keyof I18nFields, value: string) => {
    setI18nData(prev => ({
      ...prev,
      [locale]: { ...(prev[locale] || EMPTY_I18N), [field]: value },
    }))
  }

  const loadPlan = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pricing-plans')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      const plan = (data.plans || []).find((p: any) => p.id === id)
      if (!plan) { router.push(`/${lang}/admin/pricing`); return }

      setProvider(plan.provider)
      setAmount(plan.amount)
      setOriginalPrice(plan.originalPrice || '')
      setCurrency(plan.currency)
      setDurationType(plan.durationType)
      setDurationMonths(plan.durationMonths?.toString() || '1')
      setCredits(plan.credits?.toString() || '')
      setRecommended(plan.recommended)
      setIsActive(plan.isActive)
      setLocales(plan.locales?.join(', ') || '')
      setStripePriceId(plan.stripePriceId || '')
      setPaypalPlanId(plan.paypalPlanId || '')
      setCreemProductId(plan.creemProductId || '')
      setDodoProductId(plan.dodoProductId || '')

      const newI18n: Record<string, I18nFields> = {}
      for (const loc of supportedLocales) {
        const existing = plan.i18n?.[loc]
        newI18n[loc] = existing
          ? { name: existing.name || '', description: existing.description || '', duration: existing.duration || '', features: featuresToMarkdown(existing.features) }
          : { ...EMPTY_I18N }
      }
      // Preserve any extra locales stored in the DB beyond the configured ones
      for (const [loc, data] of Object.entries(plan.i18n || {})) {
        if (!newI18n[loc]) {
          const d = data as any
          newI18n[loc] = { name: d.name || '', description: d.description || '', duration: d.duration || '', features: featuresToMarkdown(d.features) }
        }
      }
      setI18nData(newI18n)
    } catch (err) {
      console.error('Error loading plan:', err)
      router.push(`/${lang}/admin/pricing`)
    } finally {
      setLoading(false)
    }
  }, [id, lang, router])

  useEffect(() => {
    if (!isNew) loadPlan()
  }, [isNew, loadPlan])

  const handleSubmit = async () => {
    setSaving(true)
    try {
      const i18n: Record<string, any> = {}
      for (const [locale, fields] of Object.entries(i18nData)) {
        if (fields.name) {
          i18n[locale] = { name: fields.name, description: fields.description, duration: fields.duration, features: fields.features }
        }
      }

      const payload: any = {
        provider, amount: parseFloat(amount),
        originalPrice: originalPrice ? parseFloat(originalPrice) : null,
        currency, durationType,
        durationMonths: durationType !== 'credits' ? parseInt(durationMonths) : null,
        credits: durationType === 'credits' ? parseInt(credits) : null,
        recommended, isActive,
        locales: locales ? locales.split(',').map(s => s.trim()).filter(Boolean) : null,
        stripePriceId: stripePriceId || null, paypalPlanId: paypalPlanId || null,
        creemProductId: creemProductId || null, dodoProductId: dodoProductId || null,
        i18n,
      }
      if (!isNew) payload.id = id

      const res = await fetch('/api/admin/pricing-plans', {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) router.push(`/${lang}/admin/pricing`)
    } finally {
      setSaving(false)
    }
  }

  const providerIdConfig = PROVIDER_ID_FIELDS[provider]
  const getProviderIdValue = () => {
    if (provider === 'stripe') return stripePriceId
    if (provider === 'paypal') return paypalPlanId
    if (provider === 'creem') return creemProductId
    if (provider === 'dodo') return dodoProductId
    return ''
  }
  const setProviderIdValue = (val: string) => {
    if (provider === 'stripe') setStripePriceId(val)
    else if (provider === 'paypal') setPaypalPlanId(val)
    else if (provider === 'creem') setCreemProductId(val)
    else if (provider === 'dodo') setDodoProductId(val)
  }

  const allLocales = Object.keys(i18nData)
  const currentFields = i18nData[activeLocale] || EMPTY_I18N

  if (loading) {
    return (
      <div className="container max-w-3xl mx-auto py-10 px-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t.common?.loading}
        </div>
      </div>
    )
  }

  return (
    <div className="container max-w-3xl mx-auto py-10 px-5">
      <div className="mb-6">
        <Link href={`/${lang}/admin/pricing`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          {tp?.backToList}
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-8">{isNew ? tp?.createPlan : tp?.editPlan}</h1>

      <div className="space-y-6">
        {/* Plan Information (i18n) */}
        <Card>
          <CardHeader>
            <CardTitle>{tp?.sections?.planInfo}</CardTitle>
            <CardDescription>{tp?.sections?.planInfoDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-1 mb-6 border-b overflow-x-auto">
              {allLocales.map(locale => (
                <button
                  key={locale}
                  type="button"
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
                    activeLocale === locale
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setActiveLocale(locale)}
                >
                  {getLocaleLabel(locale)}
                  {locale === defaultLocale && <span className="ml-1 text-xs text-muted-foreground">(default)</span>}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{tp?.form?.name}</Label>
                <Input
                  value={currentFields.name}
                  onChange={e => updateI18nField(activeLocale, 'name', e.target.value)}
                  placeholder={activeLocale === defaultLocale ? 'e.g. Monthly Plan' : `${getLocaleLabel(activeLocale)} name`}
                />
                {activeLocale !== defaultLocale && !currentFields.name && i18nData[defaultLocale]?.name && (
                  <p className="text-xs text-muted-foreground">Fallback: {i18nData[defaultLocale].name}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{tp?.form?.description}</Label>
                <Input
                  value={currentFields.description}
                  onChange={e => updateI18nField(activeLocale, 'description', e.target.value)}
                  placeholder={activeLocale === defaultLocale ? 'e.g. Monthly recurring subscription' : `${getLocaleLabel(activeLocale)} description`}
                />
              </div>
              <div className="space-y-2">
                <Label>{tp?.form?.durationLabel}</Label>
                <Input
                  value={currentFields.duration}
                  onChange={e => updateI18nField(activeLocale, 'duration', e.target.value)}
                  placeholder={activeLocale === defaultLocale ? 'month / lifetime / one-time' : `${getLocaleLabel(activeLocale)} duration label`}
                />
              </div>
              <div className="space-y-2">
                <Label>{tp?.form?.features}</Label>
                <Textarea
                  value={currentFields.features}
                  onChange={e => updateI18nField(activeLocale, 'features', e.target.value)}
                  rows={5}
                  placeholder={"- All premium features\n- Priority support\n- Unlimited access"}
                  className="font-mono text-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardHeader>
            <CardTitle>{tp?.sections?.pricing}</CardTitle>
            <CardDescription>{tp?.sections?.pricingDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{tp?.fields?.provider}</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map(p => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{tp?.fields?.currency}</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{tp?.fields?.amount}</Label>
                <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="10.00" />
              </div>
              <div className="space-y-2">
                <Label>{tp?.fields?.originalPrice}</Label>
                <Input type="number" step="0.01" value={originalPrice} onChange={e => setOriginalPrice(e.target.value)} placeholder={tp?.form?.originalPricePlaceholder} />
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{tp?.fields?.durationType}</Label>
                <Select value={durationType} onValueChange={setDurationType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DURATION_TYPES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {durationType !== 'credits' ? (
                <div className="space-y-2">
                  <Label>{tp?.fields?.durationMonths}</Label>
                  <Input type="number" value={durationMonths} onChange={e => setDurationMonths(e.target.value)} placeholder="1" />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>{tp?.fields?.credits}</Label>
                  <Input type="number" value={credits} onChange={e => setCredits(e.target.value)} placeholder="100" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Provider Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>{tp?.sections?.providerConfig}</CardTitle>
            <CardDescription>{tp?.sections?.providerConfigDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            {providerIdConfig ? (
              <div className="space-y-2">
                <Label>{(tp?.fields as any)?.[providerIdConfig.key]}</Label>
                <Input value={getProviderIdValue()} onChange={e => setProviderIdValue(e.target.value)} placeholder={providerIdConfig.placeholder} />
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Info className="h-4 w-4" />
                {tp?.sections?.noProviderConfig}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Display Settings */}
        <Card>
          <CardHeader>
            <CardTitle>{tp?.sections?.displaySettings}</CardTitle>
            <CardDescription>{tp?.sections?.displaySettingsDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-3">
                <Switch checked={recommended} onCheckedChange={setRecommended} />
                <Label>{tp?.fields?.recommended}</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <Label>{tp?.fields?.active}</Label>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{tp?.fields?.locales}</Label>
              <Input value={locales} onChange={e => setLocales(e.target.value)} placeholder={tp?.form?.localesPlaceholder} />
              <p className="text-xs text-muted-foreground">{tp?.form?.localesHint}</p>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" asChild>
            <Link href={`/${lang}/admin/pricing`}>{t.actions?.cancel}</Link>
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{tp?.saving}</>
            ) : (
              <><Save className="h-4 w-4 mr-2" />{tp?.savePlan}</>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
