'use client'

import { useState } from 'react'
import { Loader2, CheckCircle2, Copy, Check, AlertTriangle } from 'lucide-react'

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const COHORT_TYPES = [
  { value: 'basic', label: 'Basic' },
  { value: 'placement', label: 'Placement' },
  { value: 'mern', label: 'MERN' },
  { value: 'fullstack', label: 'Fullstack' }
]

interface SetupInfo {
  error: string
  setupRequired?: boolean
  setupSQL?: string
  manualSQL?: string
  note?: string
}

export default function CohortInitiator() {
  const [cohortType, setCohortType] = useState<string>('')
  const [cohortNumber, setCohortNumber] = useState<string>('')
  const [day1, setDay1] = useState<string>('')
  const [day2, setDay2] = useState<string>('')
  const [startDate, setStartDate] = useState<Date>()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [success, setSuccess] = useState<string>('')
  const [setupInfo, setSetupInfo] = useState<SetupInfo | null>(null)
  const [copiedSetup, setCopiedSetup] = useState(false)
  const [copiedManual, setCopiedManual] = useState(false)

  const copyToClipboard = async (text: string, type: 'setup' | 'manual') => {
    try {
      await navigator.clipboard.writeText(text)
      if (type === 'setup') {
        setCopiedSetup(true)
        setTimeout(() => setCopiedSetup(false), 2000)
      } else {
        setCopiedManual(true)
        setTimeout(() => setCopiedManual(false), 2000)
      }
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSetupInfo(null)

    // Validation
    if (!cohortType || !cohortNumber || !day1 || !day2 || !startDate) {
      setError('Please fill in all fields')
      return
    }

    if (day1 === day2) {
      setError('Please select two different days')
      return
    }

    // Validate cohort number format (should be like 2.0, 3.0)
    const cohortNumPattern = /^\d+\.\d+$/
    if (!cohortNumPattern.test(cohortNumber)) {
      setError('Cohort number should be in format like 2.0, 3.0, etc.')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch('/api/cohort/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cohortType,
          cohortNumber,
          day1,
          day2,
          startDate: startDate.toISOString(),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.setupRequired) {
          setSetupInfo(data)
        } else {
          setError(data.error || 'Failed to create cohort')
        }
        return
      }

      setSuccess(`Successfully created ${cohortType}${cohortNumber.replace('.', '_')}_schedule table with ${data.recordsInserted} records!`)
      
      // Reset form after successful creation
      setTimeout(() => {
        setCohortType('')
        setCohortNumber('')
        setDay1('')
        setDay2('')
        setStartDate(undefined)
        setSuccess('')
      }, 5000)
    } catch (err: any) {
      console.error('Error creating cohort:', err)
      setError(err.message || 'An error occurred while creating the cohort')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full h-full p-4 sm:p-6 overflow-auto">
      <div className="max-w-3xl mx-auto">
        <div className="bg-card/50 backdrop-blur-xl border border-border/50 rounded-2xl shadow-xl p-6">
          <div className="mb-6">
            <h2 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-orange-400 via-yellow-400 to-orange-500 bg-clip-text text-transparent">
              Cohort Initiator
            </h2>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base">
              Create a new cohort schedule by selecting cohort type, number, class days, and start date
            </p>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Cohort Type */}
            <div className="space-y-2">
              <label htmlFor="cohortType" className="block text-sm font-medium text-foreground">
                Cohort Type
              </label>
              <select
                id="cohortType"
                value={cohortType}
                onChange={(e) => setCohortType(e.target.value)}
                className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
              >
                <option value="">Select cohort type</option>
                {COHORT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Cohort Number */}
            <div className="space-y-2">
              <label htmlFor="cohortNumber" className="block text-sm font-medium text-foreground">
                Cohort Number
              </label>
              <input
                id="cohortNumber"
                type="text"
                placeholder="e.g., 2.0, 3.0"
                value={cohortNumber}
                onChange={(e) => setCohortNumber(e.target.value)}
                className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground placeholder:text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Enter in format: 2.0, 3.0, etc.
              </p>
            </div>

            {/* Class Days */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="day1" className="block text-sm font-medium text-foreground">
                  First Class Day
                </label>
                <select
                  id="day1"
                  value={day1}
                  onChange={(e) => setDay1(e.target.value)}
                  className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                >
                  <option value="">Select day</option>
                  {DAYS_OF_WEEK.map((day) => (
                    <option key={day} value={day} disabled={day === day2}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="day2" className="block text-sm font-medium text-foreground">
                  Second Class Day
                </label>
                <select
                  id="day2"
                  value={day2}
                  onChange={(e) => setDay2(e.target.value)}
                  className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                >
                  <option value="">Select day</option>
                  {DAYS_OF_WEEK.map((day) => (
                    <option key={day} value={day} disabled={day === day1}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Start Date */}
            <div className="space-y-2">
              <label htmlFor="startDate" className="block text-sm font-medium text-foreground">
                Batch Start Date
              </label>
              <input
                id="startDate"
                type="date"
                value={startDate ? startDate.toISOString().split('T')[0] : ''}
                onChange={(e) => setStartDate(e.target.value ? new Date(e.target.value) : undefined)}
                className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm">
                {error}
              </div>
            )}

            {/* Setup Required Message */}
            {setupInfo && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/50 rounded-xl space-y-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-amber-500 font-medium">Database Setup Required</p>
                    <p className="text-amber-400/80 text-sm mt-1">{setupInfo.error}</p>
                  </div>
                </div>

                {setupInfo.setupSQL && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">Option 1: Run Setup SQL (Recommended - One Time Only)</p>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(setupInfo.setupSQL!, 'setup')}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-muted/50 hover:bg-muted rounded-lg transition-colors"
                      >
                        {copiedSetup ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                        {copiedSetup ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <pre className="p-3 bg-black/30 rounded-lg text-xs text-muted-foreground overflow-x-auto max-h-48 overflow-y-auto">
                      {setupInfo.setupSQL}
                    </pre>
                  </div>
                )}

                {setupInfo.manualSQL && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">Option 2: Create Table Manually (Just This Cohort)</p>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(setupInfo.manualSQL!, 'manual')}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-muted/50 hover:bg-muted rounded-lg transition-colors"
                      >
                        {copiedManual ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                        {copiedManual ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <pre className="p-3 bg-black/30 rounded-lg text-xs text-muted-foreground overflow-x-auto max-h-32 overflow-y-auto">
                      {setupInfo.manualSQL}
                    </pre>
                  </div>
                )}

                {setupInfo.note && (
                  <p className="text-xs text-muted-foreground bg-black/20 p-2 rounded-lg">
                    💡 {setupInfo.note}
                  </p>
                )}

                <p className="text-xs text-amber-400/80">
                  After running the SQL in your Supabase SQL Editor, click &quot;Create Cohort Schedule&quot; again.
                </p>
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="p-4 bg-green-500/10 border border-green-500/50 rounded-lg text-green-500 text-sm flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                <span>{success}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-6 py-3 bg-gradient-to-r from-orange-400 via-yellow-400 to-orange-500 hover:from-orange-500 hover:via-yellow-500 hover:to-orange-600 text-white font-semibold rounded-xl transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Creating Cohort Schedule...
                </>
              ) : (
                'Create Cohort Schedule'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

