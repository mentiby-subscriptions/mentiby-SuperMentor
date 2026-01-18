'use client'

import { useState, useEffect } from 'react'
import { 
  Users, 
  Sparkles, 
  ArrowRight, 
  Check, 
  Loader2,
  GraduationCap,
  Rocket,
  Share2,
  Copy,
  ExternalLink,
  RefreshCw
} from 'lucide-react'

interface EnrollmentConfig {
  id: number
  starting_enrollment_number: number
  cohort_type: string
  cohort_number: string
  created_at: string
}

type UpdatePhase = 'idle' | 'updating' | 'success'

export default function StudentOnboarding() {
  const [config, setConfig] = useState<EnrollmentConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [updatePhase, setUpdatePhase] = useState<UpdatePhase>('idle')
  const [isEditing, setIsEditing] = useState(false)
  
  // Form state
  const [formCohortType, setFormCohortType] = useState('')
  const [formCohortNumber, setFormCohortNumber] = useState('')
  const [formStartingNumber, setFormStartingNumber] = useState('')
  const [copied, setCopied] = useState(false)

  const ONBOARDING_FORM_URL = 'https://www.onboarding.mentiby.com/'

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/enrollment-config')
      const data = await response.json()
      
      if (data.config) {
        setConfig(data.config)
        setFormCohortType(data.config.cohort_type)
        setFormCohortNumber(data.config.cohort_number)
        setFormStartingNumber(data.config.starting_enrollment_number?.toString() || '')
      }
    } catch (error) {
      console.error('Error fetching config:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateConfig = async () => {
    if (!formCohortType || !formCohortNumber) return

    setUpdatePhase('updating')
    
    try {
      // Simulate a brief delay for dramatic effect
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const response = await fetch('/api/enrollment-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          starting_enrollment_number: parseInt(formStartingNumber) || 2501,
          cohort_type: formCohortType,
          cohort_number: formCohortNumber
        })
      })

      const data = await response.json()
      
      if (data.success) {
        setConfig(data.config)
        setUpdatePhase('success')
        setIsEditing(false)
        
        // Reset to idle after showing success
        setTimeout(() => {
          setUpdatePhase('idle')
        }, 3000)
      } else {
        throw new Error(data.error)
      }
    } catch (error) {
      console.error('Error updating config:', error)
      setUpdatePhase('idle')
    }
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(ONBOARDING_FORM_URL)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-4 border-primary/20 border-t-primary animate-spin mx-auto" />
            <GraduationCap className="w-8 h-8 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="text-muted-foreground animate-pulse">Loading onboarding configuration...</p>
        </div>
      </div>
    )
  }

  // Update in progress - dramatic loader
  if (updatePhase === 'updating') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-violet-950/20">
        <div className="text-center space-y-8 animate-in fade-in zoom-in duration-500">
          {/* Animated rings */}
          <div className="relative w-40 h-40 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-violet-500/20 animate-ping" />
            <div className="absolute inset-4 rounded-full border-4 border-violet-500/30 animate-ping" style={{ animationDelay: '0.2s' }} />
            <div className="absolute inset-8 rounded-full border-4 border-violet-500/40 animate-ping" style={{ animationDelay: '0.4s' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center animate-pulse shadow-2xl shadow-violet-500/50">
                <Rocket className="w-10 h-10 text-white animate-bounce" />
              </div>
            </div>
          </div>
          
          {/* Text */}
          <div className="space-y-2">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-violet-400 via-purple-400 to-pink-400 bg-clip-text text-transparent animate-pulse">
              Onboarding Cohort {formCohortType} {formCohortNumber}
            </h2>
            <p className="text-muted-foreground">
              Configuring enrollment settings...
            </p>
          </div>
          
          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-3 h-3 rounded-full bg-violet-500"
                style={{
                  animation: 'pulse 1s ease-in-out infinite',
                  animationDelay: `${i * 0.15}s`
                }}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Success state
  if (updatePhase === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-emerald-950/10 to-background">
        <div className="text-center space-y-8 animate-in fade-in zoom-in duration-500">
          {/* Success checkmark */}
          <div className="relative w-32 h-32 mx-auto">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-emerald-400 to-green-600 animate-pulse shadow-2xl shadow-emerald-500/50" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Check className="w-16 h-16 text-white animate-in zoom-in duration-300" strokeWidth={3} />
            </div>
            {/* Sparkles around */}
            <Sparkles className="absolute -top-2 -right-2 w-8 h-8 text-yellow-400 animate-bounce" />
            <Sparkles className="absolute -bottom-2 -left-2 w-6 h-6 text-yellow-400 animate-bounce" style={{ animationDelay: '0.3s' }} />
          </div>
          
          {/* Success text */}
          <div className="space-y-3">
            <h2 className="text-4xl font-bold bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent">
              Onboarding Form Ready to Share!
            </h2>
            <p className="text-xl text-muted-foreground">
              {formCohortType} {formCohortNumber} is now accepting enrollments
            </p>
          </div>
          
          {/* Share button */}
          <button
            onClick={copyToClipboard}
            className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-2xl font-semibold text-lg transition-all duration-200 flex items-center gap-3 mx-auto shadow-xl shadow-emerald-500/30 hover:shadow-emerald-500/50"
          >
            <Share2 className="w-6 h-6" />
            Share Onboarding Link
          </button>
        </div>
      </div>
    )
  }

  // Main view
  return (
    <div className="min-h-screen p-8 space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center p-4 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 border border-violet-500/30">
          <GraduationCap className="w-12 h-12 text-violet-400" />
        </div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-violet-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          Student Onboarding
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Configure which cohort new students will be enrolled into when they complete the onboarding form
        </p>
      </div>

      {/* Current Config Card */}
      <div className="max-w-3xl mx-auto">
        <div className="relative group">
          {/* Glow effect */}
          <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600 rounded-3xl blur-lg opacity-15 group-hover:opacity-25 transition-opacity duration-500" />
          
          {/* Card */}
          <div className="relative bg-card/80 backdrop-blur-xl border border-border/50 rounded-3xl overflow-hidden">
            <div className="p-8">
              {!isEditing ? (
                /* Display Mode */
                <div className="space-y-8">
                  <div className="text-center space-y-2">
                    <p className="text-sm text-muted-foreground uppercase tracking-widest">Current Enrollment Batch</p>
                    <div className="flex items-center justify-center gap-4">
                      <span className="text-6xl font-black bg-gradient-to-br from-violet-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                        {config?.cohort_type}
                      </span>
                      <span className="text-6xl font-black text-foreground">
                        {config?.cohort_number}
                      </span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-muted/30 border border-border/50 text-center">
                      <p className="text-sm text-muted-foreground">Starting Enrollment #</p>
                      <p className="text-2xl font-bold text-foreground">{config?.starting_enrollment_number}</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-muted/30 border border-border/50 text-center">
                      <p className="text-sm text-muted-foreground">Cohort Type</p>
                      <p className="text-2xl font-bold text-foreground">{config?.cohort_type}</p>
                    </div>
                  </div>

                  {/* Onboarding Link */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/30">
                    <p className="text-sm text-muted-foreground mb-2">Onboarding Form URL</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-4 py-2 bg-background/50 rounded-xl text-sm text-foreground font-mono">
                        {ONBOARDING_FORM_URL}
                      </code>
                      <button
                        onClick={copyToClipboard}
                        className="p-2 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 transition-colors"
                        title="Copy to clipboard"
                      >
                        {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                      </button>
                      <a
                        href={ONBOARDING_FORM_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 transition-colors"
                        title="Open in new tab"
                      >
                        <ExternalLink className="w-5 h-5" />
                      </a>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-center gap-4">
                    <button
                      onClick={() => setIsEditing(true)}
                      className="px-6 py-3 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-xl font-semibold transition-all duration-200 flex items-center gap-2 shadow-lg shadow-violet-500/30"
                    >
                      <RefreshCw className="w-5 h-5" />
                      Change Onboarding Batch
                    </button>
                  </div>
                </div>
              ) : (
                /* Edit Mode */
                <div className="space-y-6">
                  <div className="text-center">
                    <h3 className="text-2xl font-bold text-foreground">Configure New Batch</h3>
                    <p className="text-muted-foreground">Update the enrollment configuration for incoming students</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Cohort Type */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Cohort Type</label>
                      <select
                        value={formCohortType}
                        onChange={(e) => setFormCohortType(e.target.value)}
                        className="w-full px-4 py-3 bg-muted/50 border border-border/50 rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      >
                        <option value="">Select type</option>
                        <option value="Basic">Basic</option>
                        <option value="Placement">Placement</option>
                        <option value="Mern">MERN</option>
                        <option value="Fullstack">Fullstack</option>
                      </select>
                    </div>

                    {/* Cohort Number */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Cohort Number</label>
                      <input
                        type="text"
                        value={formCohortNumber}
                        onChange={(e) => setFormCohortNumber(e.target.value)}
                        placeholder="e.g., 2.0"
                        className="w-full px-4 py-3 bg-muted/50 border border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      />
                    </div>

                    {/* Starting Enrollment Number */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Starting Enrollment #</label>
                      <input
                        type="number"
                        value={formStartingNumber}
                        onChange={(e) => setFormStartingNumber(e.target.value)}
                        placeholder="e.g., 2501"
                        className="w-full px-4 py-3 bg-muted/50 border border-border/50 rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      />
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-green-500/10 border border-emerald-500/30">
                    <p className="text-sm text-emerald-400 mb-1">Preview</p>
                    <p className="text-2xl font-bold text-foreground">
                      New students will be enrolled in <span className="text-emerald-400">{formCohortType} {formCohortNumber}</span>
                    </p>
                  </div>

                  {/* Buttons */}
                  <div className="flex items-center justify-center gap-4">
                    <button
                      onClick={() => {
                        setIsEditing(false)
                        // Reset form to current values
                        if (config) {
                          setFormCohortType(config.cohort_type)
                          setFormCohortNumber(config.cohort_number)
                          setFormStartingNumber(config.starting_enrollment_number?.toString() || '')
                        }
                      }}
                      className="px-6 py-3 bg-muted hover:bg-muted/80 text-foreground rounded-xl font-semibold transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleUpdateConfig}
                      disabled={!formCohortType || !formCohortNumber}
                      className="px-8 py-3 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-xl font-semibold transition-all duration-200 flex items-center gap-2 shadow-lg shadow-violet-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Sparkles className="w-5 h-5" />
                      Activate Batch
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Decorative Elements */}
      <div className="fixed top-20 left-10 w-48 h-48 bg-violet-500/5 rounded-full blur-2xl pointer-events-none" />
      <div className="fixed bottom-20 right-10 w-64 h-64 bg-purple-500/5 rounded-full blur-2xl pointer-events-none" />
    </div>
  )
}
