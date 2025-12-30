'use client'

import { useState, useEffect } from 'react'
import { Loader2, CheckCircle2, Copy, Check, AlertTriangle } from 'lucide-react'

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// Helper to parse date string as local time (not UTC)
const parseLocalDate = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day) // month is 0-indexed
}

// Helper to get day name from a Date object
const getDayName = (date: Date): string => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days[date.getDay()]
}

// Helper to format date as YYYY-MM-DD in local time
const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

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

interface Mentor {
  id: number
  name: string
  email: string
  phone: number
}

export default function CohortInitiator() {
  const [cohortType, setCohortType] = useState<string>('')
  const [cohortNumber, setCohortNumber] = useState<string>('')
  const [day1, setDay1] = useState<string>('')
  const [day2, setDay2] = useState<string>('')
  const [startDate, setStartDate] = useState<Date>()
  const [startDateInput, setStartDateInput] = useState<string>('') // Raw input string
  const [selectedMentorId, setSelectedMentorId] = useState<string>('')
  const [mentors, setMentors] = useState<Mentor[]>([])
  const [mentorsLoading, setMentorsLoading] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [success, setSuccess] = useState<string>('')
  const [setupInfo, setSetupInfo] = useState<SetupInfo | null>(null)
  const [copiedSetup, setCopiedSetup] = useState(false)
  const [copiedManual, setCopiedManual] = useState(false)
  const [dateMismatchError, setDateMismatchError] = useState<string>('')
  const [cohortExistsError, setCohortExistsError] = useState<string>('')
  const [checkingCohort, setCheckingCohort] = useState(false)
  const [cohortNumbers, setCohortNumbers] = useState<string[]>([])
  const [loadingCohortNumbers, setLoadingCohortNumbers] = useState(false)

  // Fetch cohort numbers when cohort type changes
  useEffect(() => {
    const fetchCohortNumbers = async () => {
      if (!cohortType) {
        setCohortNumbers([])
        setCohortNumber('')
        return
      }

      setLoadingCohortNumbers(true)
      setCohortNumber('') // Reset cohort number when type changes

      try {
        const response = await fetch(`/api/cohort/numbers?cohortType=${cohortType}`)
        const data = await response.json()

        if (data.cohortNumbers) {
          setCohortNumbers(data.cohortNumbers)
        } else {
          setCohortNumbers([])
        }
      } catch (err) {
        console.error('Error fetching cohort numbers:', err)
        setCohortNumbers([])
      } finally {
        setLoadingCohortNumbers(false)
      }
    }

    fetchCohortNumbers()
  }, [cohortType])

  // Check if cohort already exists when type and number are entered
  useEffect(() => {
    const checkCohortExists = async () => {
      // Only check if both cohort type and cohort number are selected
      if (!cohortType || !cohortNumber) {
        setCohortExistsError('')
        return
      }

      const tableName = `${cohortType}${cohortNumber.replace('.', '_')}_schedule`
      setCheckingCohort(true)

      try {
        const response = await fetch(`/api/cohort/check-exists?tableName=${tableName}`)
        const data = await response.json()

        if (data.exists) {
          setCohortExistsError(
            `The batch "${cohortType} ${cohortNumber}" is already in progress and can't be initiated again. If you want to edit, head on to the Cohort Schedule Editor Tab.`
          )
        } else {
          setCohortExistsError('')
        }
      } catch (err) {
        console.error('Error checking cohort existence:', err)
        setCohortExistsError('')
      } finally {
        setCheckingCohort(false)
      }
    }

    // Debounce the check
    const timeoutId = setTimeout(checkCohortExists, 500)
    return () => clearTimeout(timeoutId)
  }, [cohortType, cohortNumber])

  // Validate that start date matches day1 (only when full date is entered: YYYY-MM-DD = 10 chars)
  useEffect(() => {
    // Only validate if we have a complete date input (10 characters: YYYY-MM-DD)
    if (startDateInput.length === 10 && startDate && day1) {
      const startDayName = getDayName(startDate)
      if (startDayName !== day1) {
        setDateMismatchError(`Batch Start Date must be a ${day1}. You selected a ${startDayName}.`)
      } else {
        setDateMismatchError('')
      }
    } else {
      setDateMismatchError('')
    }
  }, [startDate, startDateInput, day1])

  // Fetch mentors on component mount
  useEffect(() => {
    async function fetchMentors() {
      try {
        const response = await fetch('/api/mentors')
        const data = await response.json()
        if (data.mentors) {
          setMentors(data.mentors)
        }
      } catch (err) {
        console.error('Error fetching mentors:', err)
      } finally {
        setMentorsLoading(false)
      }
    }
    fetchMentors()
  }, [])

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
    if (!cohortType || !cohortNumber || !day1 || !day2 || !startDate || !selectedMentorId) {
      setError('Please fill in all fields including mentor selection')
      return
    }

    if (day1 === day2) {
      setError('Please select two different days')
      return
    }

    if (dateMismatchError) {
      setError('Batch Start Date must match the First Class Day')
      return
    }

    if (cohortExistsError) {
      setError('This cohort already exists and cannot be initiated again')
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
          mentorId: parseInt(selectedMentorId),
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
        setStartDateInput('')
        setSelectedMentorId('')
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
              <select
                id="cohortNumber"
                value={cohortNumber}
                onChange={(e) => setCohortNumber(e.target.value)}
                disabled={!cohortType || loadingCohortNumbers}
                className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">
                  {!cohortType 
                    ? 'Select cohort type first' 
                    : loadingCohortNumbers 
                      ? 'Loading cohort numbers...' 
                      : cohortNumbers.length === 0 
                        ? 'No cohorts found' 
                        : 'Select cohort number'}
                </option>
                {cohortNumbers.map((num) => (
                  <option key={num} value={num}>
                    {num}
                  </option>
                ))}
              </select>
              {cohortType && cohortNumbers.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Found {cohortNumbers.length} cohort number(s) for {cohortType}
                </p>
              )}
              {checkingCohort && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Checking if cohort exists...
                </p>
              )}
              {cohortExistsError && (
                <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm">
                  <p className="font-medium">⚠️ {cohortExistsError}</p>
                </div>
              )}
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
                value={startDateInput}
                onChange={(e) => {
                  const value = e.target.value
                  setStartDateInput(value)
                  setStartDate(value && value.length === 10 ? parseLocalDate(value) : undefined)
                }}
                className={`w-full px-4 py-3 bg-muted/30 border rounded-xl focus:outline-none focus:ring-2 text-foreground ${
                  dateMismatchError 
                    ? 'border-red-500 focus:ring-red-500' 
                    : 'border-border/50 focus:ring-primary'
                }`}
              />
              {dateMismatchError && (
                <p className="text-red-500 text-sm font-medium flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                  {dateMismatchError}
                </p>
              )}
              {day1 && !dateMismatchError && startDate && (
                <p className="text-green-500 text-sm flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Start date matches first class day ({day1})
                </p>
              )}
            </div>

            {/* Mentor Selection */}
            <div className="space-y-2">
              <label htmlFor="mentor" className="block text-sm font-medium text-foreground">
                Assign Mentor (for Live Sessions)
              </label>
              <select
                id="mentor"
                value={selectedMentorId}
                onChange={(e) => setSelectedMentorId(e.target.value)}
                disabled={mentorsLoading}
                className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground disabled:opacity-50"
              >
                <option value="">
                  {mentorsLoading ? 'Loading mentors...' : 'Select a mentor'}
                </option>
                {mentors.map((mentor) => (
                  <option key={mentor.id} value={mentor.id}>
                    {mentor.name} ({mentor.email})
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                This mentor will be assigned to all live session entries
              </p>
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
              disabled={isLoading || !!dateMismatchError || !!cohortExistsError || checkingCohort}
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

