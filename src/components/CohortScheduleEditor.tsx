'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, AlertTriangle, Calendar, Clock, ArrowLeft, ArrowRight, Edit3, Eye, ChevronDown, ChevronRight, Save, X, RefreshCw, Trash2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

const COHORT_TYPES = [
  { value: 'basic', label: 'Basic' },
  { value: 'placement', label: 'Placement' },
  { value: 'mern', label: 'MERN' },
  { value: 'fullstack', label: 'Fullstack' }
]

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const SESSION_TYPES = ['live session', 'self paced', 'project', 'assignment', 'contest']

interface Mentor {
  id: number
  name: string
  email: string
}

type EditorTab = 'view' | 'postpone' | 'prepone' | 'bulk-edit'

interface ScheduleRow {
  id: number
  week_number: number
  session_number: number
  date: string | null
  time: string | null
  day: string | null
  session_type: string | null
  subject_type: string | null
  subject_name: string | null
  subject_topic: string | null
  initial_session_material: string | null
  session_material: string | null
  session_recording: string | null
  mentor_id: number | null
  teams_meeting_link: string | null
  notification_sent: boolean
  created_at: string
}

interface EditingCell {
  rowId: number
  field: keyof ScheduleRow
  value: string
  originalValue: string
}

interface WeekGroup {
  weekNumber: number
  sessions: ScheduleRow[]
}

interface DateSpan {
  start: string
  end: string
  label: string
}

interface NewSessionForm {
  week_number: number
  session_type: string
  subject_type: string
  subject_name: string
  subject_topic: string
  initial_session_material: string
  session_material: string
  session_recording: string
  mentor_id: string
  time: string
  selectedDate: string
}

// Bulk editable fields (from session_type to teams_meeting_link)
const BULK_EDITABLE_FIELDS: { key: keyof ScheduleRow; label: string; type: 'text' | 'dropdown' | 'time' }[] = [
  { key: 'session_type', label: 'Session Type', type: 'dropdown' },
  { key: 'subject_type', label: 'Subject Type', type: 'text' },
  { key: 'subject_name', label: 'Subject Name', type: 'text' },
  { key: 'subject_topic', label: 'Subject Topic', type: 'text' },
  { key: 'initial_session_material', label: 'Initial Material', type: 'text' },
  { key: 'session_material', label: 'Session Material', type: 'text' },
  { key: 'session_recording', label: 'Session Recording', type: 'text' },
  { key: 'mentor_id', label: 'Mentor', type: 'dropdown' },
  { key: 'teams_meeting_link', label: 'Teams Link', type: 'text' },
  { key: 'time', label: 'Time', type: 'time' },
]

// Columns to display (excluding id and notification_sent)
const DISPLAY_COLUMNS: { key: keyof ScheduleRow; label: string; width: string }[] = [
  { key: 'date', label: 'Date', width: 'w-28' },
  { key: 'time', label: 'Time', width: 'w-24' },
  { key: 'day', label: 'Day', width: 'w-24' },
  { key: 'session_type', label: 'Session Type', width: 'w-32' },
  { key: 'subject_type', label: 'Subject Type', width: 'w-32' },
  { key: 'subject_name', label: 'Subject Name', width: 'w-40' },
  { key: 'subject_topic', label: 'Subject Topic', width: 'w-48' },
  { key: 'initial_session_material', label: 'Initial Material', width: 'w-40' },
  { key: 'session_material', label: 'Session Material', width: 'w-40' },
  { key: 'session_recording', label: 'Session Recording', width: 'w-40' },
  { key: 'mentor_id', label: 'Mentor', width: 'w-28' },
  { key: 'teams_meeting_link', label: 'Teams Link', width: 'w-40' },
]

export default function CohortScheduleEditor() {
  const [cohortType, setCohortType] = useState<string>('')
  const [cohortNumber, setCohortNumber] = useState<string>('')
  const [cohortNumbers, setCohortNumbers] = useState<string[]>([])
  const [loadingCohortNumbers, setLoadingCohortNumbers] = useState(false)
  const [checkingCohort, setCheckingCohort] = useState(false)
  const [cohortExists, setCohortExists] = useState<boolean | null>(null)
  const [activeTab, setActiveTab] = useState<EditorTab>('postpone')
  const [tableName, setTableName] = useState<string>('')

  // Schedule data states
  const [scheduleData, setScheduleData] = useState<ScheduleRow[]>([])
  const [loadingSchedule, setLoadingSchedule] = useState(false)
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set())
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [toastMessage, setToastMessage] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })
  const [mentors, setMentors] = useState<Mentor[]>([])
  const editingCellRef = useRef<HTMLDivElement>(null)
  const isSelectingDropdown = useRef(false)
  const [deletingWeek, setDeletingWeek] = useState<number | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null)
  const [isRefreshingAfterDelete, setIsRefreshingAfterDelete] = useState(false)
  
  // Add Session Modal state
  const [showAddSessionModal, setShowAddSessionModal] = useState<number | null>(null) // week number
  const [addingSession, setAddingSession] = useState(false)
  const [newSessionForm, setNewSessionForm] = useState<NewSessionForm>({
    week_number: 0,
    session_type: 'live session',
    subject_type: '',
    subject_name: '',
    subject_topic: '',
    initial_session_material: '',
    session_material: '',
    session_recording: '',
    mentor_id: '',
    time: '21:00:00',
    selectedDate: ''
  })
  const [availableDateSpans, setAvailableDateSpans] = useState<DateSpan[]>([])

  // Postpone/Prepone state
  const [selectedWeekNumber, setSelectedWeekNumber] = useState<string>('')
  const [selectedSessionDate, setSelectedSessionDate] = useState<string>('')
  const [selectedSessionType, setSelectedSessionType] = useState<string>('')
  const [selectedSubjectName, setSelectedSubjectName] = useState<string>('')
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null)
  const [newDateForMove, setNewDateForMove] = useState<string>('')
  const [newTimeForMove, setNewTimeForMove] = useState<string>('')
  const [isMovingSession, setIsMovingSession] = useState(false)

  // Bulk Edit state
  const [bulkEditMode, setBulkEditMode] = useState(false)
  const [selectedSessions, setSelectedSessions] = useState<Set<number>>(new Set())
  const [showBulkEditModal, setShowBulkEditModal] = useState(false)
  const [bulkEditStep, setBulkEditStep] = useState<1 | 2>(1) // Step 1: Select fields, Step 2: Enter values
  const [selectedBulkFields, setSelectedBulkFields] = useState<Set<keyof ScheduleRow>>(new Set())
  const [bulkEditValues, setBulkEditValues] = useState<Record<string, string>>({})
  const [isBulkSaving, setIsBulkSaving] = useState(false)

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Check if clicking on a select/option element anywhere in the document
      const target = event.target as HTMLElement
      if (target.tagName === 'OPTION' || target.tagName === 'SELECT') {
        return
      }

      // Don't close if we're in the middle of selecting from a dropdown
      if (isSelectingDropdown.current) {
        // Reset the flag after a short delay
        setTimeout(() => {
          isSelectingDropdown.current = false
        }, 100)
        return
      }

      if (editingCell && editingCellRef.current && !editingCellRef.current.contains(event.target as Node)) {
        // For dropdowns, just cancel (value already saved on change)
        // For other inputs, save the current value
        handleCancelEdit()
      }
    }

    if (editingCell) {
      // Add listener with a small delay to avoid immediate trigger
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside)
      }, 150)

      return () => {
        clearTimeout(timeoutId)
        document.removeEventListener('mousedown', handleClickOutside)
        isSelectingDropdown.current = false
      }
    }
  }, [editingCell])

  // Fetch mentors on component mount
  useEffect(() => {
    const fetchMentors = async () => {
      try {
        const response = await fetch('/api/mentors')
        const data = await response.json()
        if (data.mentors) {
          setMentors(data.mentors)
        }
      } catch (err) {
        console.error('Error fetching mentors:', err)
      }
    }
    fetchMentors()
  }, [])

  // Fetch cohort numbers when cohort type changes
  useEffect(() => {
    const fetchCohortNumbers = async () => {
      if (!cohortType) {
        setCohortNumbers([])
        setCohortNumber('')
        setCohortExists(null)
        setScheduleData([])
        return
      }

      setLoadingCohortNumbers(true)
      setCohortNumber('')
      setCohortExists(null)
      setScheduleData([])

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

  // Check if cohort exists when both type and number are selected
  useEffect(() => {
    const checkCohortExists = async () => {
      if (!cohortType || !cohortNumber) {
        setCohortExists(null)
        setTableName('')
        setScheduleData([])
        return
      }

      const name = `${cohortType}${cohortNumber.replace('.', '_')}_schedule`
      setTableName(name)
      setCheckingCohort(true)

      try {
        const response = await fetch(`/api/cohort/check-exists?tableName=${name}`)
        const data = await response.json()
        setCohortExists(data.exists)

        // If cohort exists, fetch schedule data
        if (data.exists) {
          fetchScheduleData(name)
        }
      } catch (err) {
        console.error('Error checking cohort existence:', err)
        setCohortExists(false)
      } finally {
        setCheckingCohort(false)
      }
    }

    const timeoutId = setTimeout(checkCohortExists, 300)
    return () => clearTimeout(timeoutId)
  }, [cohortType, cohortNumber])

  const fetchScheduleData = async (name: string) => {
    setLoadingSchedule(true)
    try {
      const response = await fetch(`/api/cohort/schedule?tableName=${name}`)
      const data = await response.json()

      if (data.schedule) {
        setScheduleData(data.schedule)
        // Expand all weeks by default
        const weeks = new Set<number>(data.schedule.map((row: ScheduleRow) => row.week_number))
        setExpandedWeeks(weeks)
      }
    } catch (err) {
      console.error('Error fetching schedule:', err)
      showToast('Failed to load schedule data', 'error')
    } finally {
      setLoadingSchedule(false)
    }
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToastMessage({ show: true, message, type })
    setTimeout(() => setToastMessage({ show: false, message: '', type: 'success' }), 3000)
  }

  // Delete entire week and recalculate subsequent weeks
  const handleDeleteWeek = async (weekNumber: number) => {
    setDeletingWeek(weekNumber)
    setShowDeleteConfirm(null)
    setIsRefreshingAfterDelete(true)

    try {
      const response = await fetch('/api/cohort/delete-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableName,
          weekNumber
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete week')
      }

      showToast(`Week ${weekNumber} deleted! ${data.updatedCount || 0} sessions updated.`, 'success')
      
      // Refresh the schedule data
      await fetchScheduleData(tableName)

    } catch (err: any) {
      console.error('Error deleting week:', err)
      showToast(err.message || 'Failed to delete week', 'error')
    } finally {
      setDeletingWeek(null)
      setIsRefreshingAfterDelete(false)
    }
  }

  // Calculate available date spans for a week (gaps between existing sessions)
  const calculateAvailableDateSpans = (weekNumber: number): DateSpan[] => {
    const spans: DateSpan[] = []
    
    // Get today's date (start of day in local time)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    // Get all sessions sorted by date
    const allSessionsSorted = [...scheduleData]
      .filter(s => s.date)
      .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime())
    
    // Get sessions for this week and adjacent weeks
    const thisWeekSessions = allSessionsSorted.filter(s => s.week_number === weekNumber)
    const prevWeekSessions = allSessionsSorted.filter(s => s.week_number === weekNumber - 1)
    const nextWeekSessions = allSessionsSorted.filter(s => s.week_number === weekNumber + 1)
    
    // Find the date range for this week
    let weekStartDate: Date | null = null
    let weekEndDate: Date | null = null
    
    // Week start: day after last session of previous week, or first session of this week - 7 days
    if (prevWeekSessions.length > 0) {
      const lastPrevSession = prevWeekSessions[prevWeekSessions.length - 1]
      weekStartDate = new Date(lastPrevSession.date!)
      weekStartDate.setDate(weekStartDate.getDate() + 1)
    } else if (thisWeekSessions.length > 0) {
      weekStartDate = new Date(thisWeekSessions[0].date!)
      weekStartDate.setDate(weekStartDate.getDate() - 7)
    }
    
    // Week end: day before first session of next week, or last session of this week + 7 days
    if (nextWeekSessions.length > 0) {
      const firstNextSession = nextWeekSessions[0]
      weekEndDate = new Date(firstNextSession.date!)
      weekEndDate.setDate(weekEndDate.getDate() - 1)
    } else if (thisWeekSessions.length > 0) {
      weekEndDate = new Date(thisWeekSessions[thisWeekSessions.length - 1].date!)
      weekEndDate.setDate(weekEndDate.getDate() + 7)
    }
    
    if (!weekStartDate || !weekEndDate) {
      return spans
    }
    
    // Ensure weekStartDate is not before today
    if (weekStartDate < today) {
      weekStartDate = new Date(today)
    }
    
    // If the entire week is in the past, return empty spans
    if (weekEndDate < today) {
      return spans
    }
    
    // Helper to format date locally
    const formatLocal = (d: Date): string => {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    // Get all dates that already have sessions in this week
    const existingDates = new Set(
      thisWeekSessions.map(s => String(s.date!).split('T')[0])
    )
    
    // Find gaps (consecutive available dates)
    let currentSpanStart: Date | null = null
    let currentDate = new Date(weekStartDate)
    currentDate.setHours(12, 0, 0, 0) // Use noon to avoid timezone issues
    
    while (currentDate <= weekEndDate) {
      const dateStr = formatLocal(currentDate)
      
      // Skip dates before today
      const currentDateMidnight = new Date(currentDate)
      currentDateMidnight.setHours(0, 0, 0, 0)
      if (currentDateMidnight < today) {
        currentDate.setDate(currentDate.getDate() + 1)
        continue
      }
      
      if (!existingDates.has(dateStr)) {
        // This date is available
        if (!currentSpanStart) {
          currentSpanStart = new Date(currentDate)
        }
      } else {
        // This date has a session
        if (currentSpanStart) {
          const spanEnd = new Date(currentDate)
          spanEnd.setDate(spanEnd.getDate() - 1)
          
          // Only add span if end date is today or in the future
          const spanEndMidnight = new Date(spanEnd)
          spanEndMidnight.setHours(0, 0, 0, 0)
          if (spanEndMidnight >= today) {
            spans.push({
              start: formatLocal(currentSpanStart),
              end: formatLocal(spanEnd),
              label: formatDateSpanLabel(currentSpanStart, spanEnd)
            })
          }
          currentSpanStart = null
        }
      }
      
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    // Don't forget the last span
    if (currentSpanStart) {
      spans.push({
        start: formatLocal(currentSpanStart),
        end: formatLocal(weekEndDate),
        label: formatDateSpanLabel(currentSpanStart, weekEndDate)
      })
    }
    
    return spans
  }
  
  // Format date span label like "2nd Jan → 5th Jan"
  const formatDateSpanLabel = (start: Date, end: Date): string => {
    const formatDate = (d: Date) => {
      const day = d.getDate()
      const suffix = getDaySuffix(day)
      const month = d.toLocaleDateString('en-IN', { month: 'short' })
      return `${day}${suffix} ${month}`
    }
    
    if (start.toISOString().split('T')[0] === end.toISOString().split('T')[0]) {
      return formatDate(start)
    }
    return `${formatDate(start)} → ${formatDate(end)}`
  }
  
  const getDaySuffix = (day: number): string => {
    if (day >= 11 && day <= 13) return 'th'
    switch (day % 10) {
      case 1: return 'st'
      case 2: return 'nd'
      case 3: return 'rd'
      default: return 'th'
    }
  }
  
  // Open add session modal
  const handleOpenAddSession = (weekNumber: number) => {
    const weekSessions = scheduleData.filter(s => s.week_number === weekNumber)
    const firstSession = weekSessions[0]
    
    // Pre-fill form with values from first session of the week
    setNewSessionForm({
      week_number: weekNumber,
      session_type: firstSession?.session_type || 'live session',
      subject_type: firstSession?.subject_type || '',
      subject_name: firstSession?.subject_name || '',
      subject_topic: '',
      initial_session_material: '',
      session_material: '',
      session_recording: '',
      mentor_id: firstSession?.mentor_id?.toString() || '',
      time: firstSession?.time || '21:00:00',
      selectedDate: ''
    })
    
    // Calculate available date spans
    const spans = calculateAvailableDateSpans(weekNumber)
    setAvailableDateSpans(spans)
    
    setShowAddSessionModal(weekNumber)
  }
  
  // Handle add session form submission
  const handleAddSession = async () => {
    if (!newSessionForm.selectedDate) {
      showToast('Please select a date', 'error')
      return
    }
    
    setAddingSession(true)
    
    try {
      // Calculate the day name from the selected date
      const dateObj = new Date(newSessionForm.selectedDate + 'T00:00:00')
      const dayName = DAYS_OF_WEEK[dateObj.getDay()]
      
      const response = await fetch('/api/cohort/add-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableName,
          week_number: newSessionForm.week_number,
          date: newSessionForm.selectedDate,
          day: dayName,
          time: newSessionForm.time || null,
          session_type: newSessionForm.session_type || null,
          subject_type: newSessionForm.subject_type || null,
          subject_name: newSessionForm.subject_name || null,
          subject_topic: newSessionForm.subject_topic || null,
          initial_session_material: newSessionForm.initial_session_material || null,
          session_material: newSessionForm.session_material || null,
          session_recording: newSessionForm.session_recording || null,
          mentor_id: newSessionForm.mentor_id ? parseInt(newSessionForm.mentor_id) : null,
          teams_meeting_link: null
        })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to add session')
      }
      
      showToast(data.message || 'Session added successfully!', 'success')
      setShowAddSessionModal(null)
      
      // Refresh schedule data
      await fetchScheduleData(tableName)
      
    } catch (err: any) {
      console.error('Error adding session:', err)
      showToast(err.message || 'Failed to add session', 'error')
    } finally {
      setAddingSession(false)
    }
  }

  // Bulk Edit Functions
  const toggleSessionSelection = (sessionId: number) => {
    setSelectedSessions(prev => {
      const newSet = new Set(prev)
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId)
      } else {
        newSet.add(sessionId)
      }
      return newSet
    })
  }

  const toggleSelectAllInWeek = (weekNumber: number) => {
    const weekSessionIds = scheduleData
      .filter(s => s.week_number === weekNumber)
      .map(s => s.id)
    
    const allSelected = weekSessionIds.every(id => selectedSessions.has(id))
    
    setSelectedSessions(prev => {
      const newSet = new Set(prev)
      if (allSelected) {
        // Deselect all in this week
        weekSessionIds.forEach(id => newSet.delete(id))
      } else {
        // Select all in this week
        weekSessionIds.forEach(id => newSet.add(id))
      }
      return newSet
    })
  }

  const openBulkEditModal = () => {
    if (selectedSessions.size === 0) {
      showToast('Please select at least one session', 'error')
      return
    }
    setBulkEditStep(1)
    setSelectedBulkFields(new Set())
    setBulkEditValues({})
    setShowBulkEditModal(true)
  }

  const toggleBulkField = (field: keyof ScheduleRow) => {
    setSelectedBulkFields(prev => {
      const newSet = new Set(prev)
      if (newSet.has(field)) {
        newSet.delete(field)
      } else {
        newSet.add(field)
      }
      return newSet
    })
  }

  const proceedToStep2 = () => {
    if (selectedBulkFields.size === 0) {
      showToast('Please select at least one field to edit', 'error')
      return
    }
    // Initialize bulk edit values
    const initialValues: Record<string, string> = {}
    selectedBulkFields.forEach(field => {
      initialValues[field] = ''
    })
    setBulkEditValues(initialValues)
    setBulkEditStep(2)
  }

  const handleBulkSave = async () => {
    setIsBulkSaving(true)
    
    try {
      const sessionIds = Array.from(selectedSessions)
      const updates: Record<string, any> = {}
      
      selectedBulkFields.forEach(field => {
        const value = bulkEditValues[field]
        if (value !== undefined && value !== '') {
          updates[field] = field === 'mentor_id' ? parseInt(value) || null : value
        }
      })
      
      if (Object.keys(updates).length === 0) {
        showToast('Please enter at least one value', 'error')
        setIsBulkSaving(false)
        return
      }

      const response = await fetch('/api/cohort/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableName,
          sessionIds,
          updates
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to bulk update')
      }

      showToast(`Updated ${sessionIds.length} sessions successfully!`, 'success')
      setShowBulkEditModal(false)
      setSelectedSessions(new Set())
      
      // Refresh schedule data
      await fetchScheduleData(tableName)

    } catch (err: any) {
      console.error('Error bulk updating:', err)
      showToast(err.message || 'Failed to bulk update', 'error')
    } finally {
      setIsBulkSaving(false)
    }
  }

  const clearSelection = () => {
    setSelectedSessions(new Set())
    setBulkEditMode(false)
  }

  const toggleBulkEditMode = () => {
    if (bulkEditMode) {
      // Exiting bulk edit mode - clear selection
      setSelectedSessions(new Set())
    }
    setBulkEditMode(!bulkEditMode)
  }

  // Get unique week numbers from schedule
  const getUniqueWeekNumbers = (): number[] => {
    return Array.from(new Set(
      scheduleData
        .filter(s => s.week_number != null)
        .map(s => s.week_number!)
    )).sort((a, b) => a - b)
  }

  // Get unique dates from schedule (optionally filtered by week)
  const getUniqueDates = (): string[] => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    let filtered = scheduleData.filter(s => s.date)
    if (selectedWeekNumber) {
      filtered = filtered.filter(s => s.week_number === parseInt(selectedWeekNumber))
    }
    
    return Array.from(new Set(
      filtered.map(s => String(s.date).split('T')[0])
    )).sort()
  }

  // Get unique session types from schedule (optionally filtered by week)
  const getUniqueSessionTypes = (): string[] => {
    let filtered = scheduleData.filter(s => s.session_type)
    if (selectedWeekNumber) {
      filtered = filtered.filter(s => s.week_number === parseInt(selectedWeekNumber))
    }
    
    return Array.from(new Set(
      filtered.map(s => s.session_type!)
    )).sort()
  }

  // Get unique subject names filtered by week, date and session type
  const getFilteredSubjectNames = (): string[] => {
    return Array.from(new Set(
      scheduleData
        .filter(s => {
          const matchWeek = !selectedWeekNumber || s.week_number === parseInt(selectedWeekNumber)
          const matchDate = !selectedSessionDate || String(s.date).split('T')[0] === selectedSessionDate
          const matchType = !selectedSessionType || s.session_type === selectedSessionType
          return matchWeek && matchDate && matchType && s.subject_name
        })
        .map(s => s.subject_name!)
    )).sort()
  }

  // Get filtered sessions based on selections
  const getFilteredSessions = (): ScheduleRow[] => {
    return scheduleData.filter(s => {
      const matchWeek = !selectedWeekNumber || s.week_number === parseInt(selectedWeekNumber)
      const matchDate = !selectedSessionDate || String(s.date).split('T')[0] === selectedSessionDate
      const matchType = !selectedSessionType || s.session_type === selectedSessionType
      const matchSubject = !selectedSubjectName || s.subject_name === selectedSubjectName
      return matchWeek && matchDate && matchType && matchSubject
    })
  }

  // Get available dates for postpone (dates after current session)
  const getPostponeDates = (): string[] => {
    if (!selectedSessionId) return []
    
    const session = scheduleData.find(s => s.id === selectedSessionId)
    if (!session || !session.date) return []

    const sessionDate = new Date(String(session.date).split('T')[0] + 'T12:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Get next session's date as upper limit
    const nextSession = getNextSession(session)
    let maxDate: Date
    if (nextSession && nextSession.date) {
      maxDate = new Date(String(nextSession.date).split('T')[0] + 'T12:00:00')
      maxDate.setDate(maxDate.getDate() - 1)
    } else {
      maxDate = new Date(sessionDate)
      maxDate.setDate(maxDate.getDate() + 30)
    }

    // Get existing dates to exclude
    const existingDates = new Set(
      scheduleData
        .filter(s => s.id !== selectedSessionId && s.date)
        .map(s => String(s.date).split('T')[0])
    )

    const dates: string[] = []
    let currentDate = new Date(Math.max(sessionDate.getTime() + 86400000, today.getTime())) // Start from day after session or today
    
    while (currentDate <= maxDate) {
      const dateStr = formatDateLocal(currentDate)
      if (!existingDates.has(dateStr)) {
        dates.push(dateStr)
      }
      currentDate.setDate(currentDate.getDate() + 1)
    }

    return dates
  }

  // Get available dates for prepone (dates before current session)
  const getPreponeDates = (): string[] => {
    if (!selectedSessionId) return []
    
    const session = scheduleData.find(s => s.id === selectedSessionId)
    if (!session || !session.date) return []

    const sessionDate = new Date(String(session.date).split('T')[0] + 'T12:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Get previous session's date as lower limit
    const prevSession = getPreviousSession(session)
    let minDate: Date
    if (prevSession && prevSession.date) {
      minDate = new Date(String(prevSession.date).split('T')[0] + 'T12:00:00')
      minDate.setDate(minDate.getDate() + 1)
    } else {
      minDate = new Date(sessionDate)
      minDate.setDate(minDate.getDate() - 30)
    }

    // Ensure minDate is not before today
    if (minDate < today) {
      minDate = today
    }

    // Get existing dates to exclude
    const existingDates = new Set(
      scheduleData
        .filter(s => s.id !== selectedSessionId && s.date)
        .map(s => String(s.date).split('T')[0])
    )

    const dates: string[] = []
    let currentDate = new Date(minDate)
    const maxDate = new Date(sessionDate)
    maxDate.setDate(maxDate.getDate() - 1) // Day before current session
    
    while (currentDate <= maxDate) {
      const dateStr = formatDateLocal(currentDate)
      if (!existingDates.has(dateStr)) {
        dates.push(dateStr)
      }
      currentDate.setDate(currentDate.getDate() + 1)
    }

    return dates
  }

  // Handle session move (postpone/prepone)
  const handleMoveSession = async (type: 'postpone' | 'prepone') => {
    if (!selectedSessionId) {
      showToast('Please select a session', 'error')
      return
    }

    const currentDate = getSelectedSessionDate()
    const currentTime = getSelectedSessionTime()?.substring(0, 5) || ''
    const effectiveDate = newDateForMove || currentDate
    const effectiveTime = newTimeForMove || currentTime

    // Check if anything changed
    const dateChanged = effectiveDate !== currentDate
    const timeChanged = effectiveTime !== currentTime

    if (!dateChanged && !timeChanged) {
      showToast('Please change either date or time', 'error')
      return
    }

    // If only time changed (same date), validate time direction
    if (!dateChanged && timeChanged) {
      if (!isTimeValidForMove(effectiveTime, type)) {
        if (type === 'prepone') {
          showToast(`For prepone on same date, time must be before ${currentTime}`, 'error')
        } else {
          showToast(`For postpone on same date, time must be after ${currentTime}`, 'error')
        }
        return
      }
    }

    setIsMovingSession(true)

    try {
      // Update date if changed
      if (dateChanged) {
        const dateObj = new Date(effectiveDate + 'T12:00:00')
        const dayName = DAYS_OF_WEEK[dateObj.getDay()]

        const response = await fetch('/api/cohort/schedule', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tableName,
            id: selectedSessionId,
            field: 'date',
            value: effectiveDate
          })
        })

        if (!response.ok) {
          throw new Error('Failed to update date')
        }

        // Also update the day
        await fetch('/api/cohort/schedule', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tableName,
            id: selectedSessionId,
            field: 'day',
            value: dayName
          })
        })
      }

      // Update time if changed
      if (timeChanged) {
        await fetch('/api/cohort/schedule', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tableName,
            id: selectedSessionId,
            field: 'time',
            value: effectiveTime
          })
        })
      }

      showToast(`Session ${type === 'postpone' ? 'postponed' : 'preponed'} successfully!`, 'success')
      
      // Reset selections
      setSelectedWeekNumber('')
      setSelectedSessionDate('')
      setSelectedSessionType('')
      setSelectedSubjectName('')
      setSelectedSessionId(null)
      setNewDateForMove('')
      setNewTimeForMove('')

      // Refresh schedule
      await fetchScheduleData(tableName)

    } catch (err: any) {
      console.error(`Error ${type}ing session:`, err)
      showToast(err.message || `Failed to ${type} session`, 'error')
    } finally {
      setIsMovingSession(false)
    }
  }

  // Reset postpone/prepone selections when switching tabs
  const resetMoveSelections = () => {
    setSelectedWeekNumber('')
    setSelectedSessionDate('')
    setSelectedSessionType('')
    setSelectedSubjectName('')
    setSelectedSessionId(null)
    setNewDateForMove('')
    setNewTimeForMove('')
  }

  // Get current session's time for placeholder
  const getSelectedSessionTime = (): string => {
    if (!selectedSessionId) return ''
    const session = scheduleData.find(s => s.id === selectedSessionId)
    return session?.time || ''
  }

  // Get current session's date
  const getSelectedSessionDate = (): string => {
    if (!selectedSessionId) return ''
    const session = scheduleData.find(s => s.id === selectedSessionId)
    return session?.date?.split('T')[0] || ''
  }

  // Validate time for postpone/prepone when date is unchanged
  const isTimeValidForMove = (newTime: string, mode: 'postpone' | 'prepone'): boolean => {
    const currentTime = getSelectedSessionTime()?.substring(0, 5)
    if (!currentTime || !newTime) return true
    
    // Convert to minutes for comparison
    const [currHour, currMin] = currentTime.split(':').map(Number)
    const [newHour, newMin] = newTime.split(':').map(Number)
    const currMinutes = currHour * 60 + currMin
    const newMinutes = newHour * 60 + newMin
    
    if (mode === 'prepone') {
      // For prepone: new time must be BEFORE current time (12:00 AM to current-1 min)
      return newMinutes < currMinutes
    } else {
      // For postpone: new time must be AFTER current time (current+1 min to 11:59 PM)
      return newMinutes > currMinutes
    }
  }

  // Get time constraints for display
  const getTimeConstraintText = (mode: 'postpone' | 'prepone'): string => {
    const currentTime = getSelectedSessionTime()?.substring(0, 5)
    if (!currentTime) return ''
    
    if (mode === 'prepone') {
      return `Select time before ${currentTime}`
    } else {
      return `Select time after ${currentTime}`
    }
  }
  
  // Auto-prepend https:// to URL fields on blur/tab
  const handleUrlBlur = (e: React.FocusEvent<HTMLInputElement>, field: keyof NewSessionForm) => {
    const value = e.target.value
    if (value && value.trim() !== '' && !value.startsWith('http://') && !value.startsWith('https://')) {
      const newValue = `https://${value}`
      setNewSessionForm(prev => ({ ...prev, [field]: newValue }))
    }
  }
  
  // Handle Tab key to prepend https:// before moving to next field
  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, field: keyof NewSessionForm) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      const input = e.target as HTMLInputElement
      const value = input.value
      if (value && value.trim() !== '' && !value.startsWith('http://') && !value.startsWith('https://')) {
        e.preventDefault() // Stop default tab behavior
        const newValue = `https://${value}`
        setNewSessionForm(prev => ({ ...prev, [field]: newValue }))
        
        // Find and focus next focusable element
        const form = input.closest('form') || input.closest('.space-y-6')
        if (form) {
          const focusables = form.querySelectorAll('input, select, button, textarea')
          const currentIndex = Array.from(focusables).indexOf(input)
          const nextElement = focusables[currentIndex + 1] as HTMLElement
          if (nextElement) {
            setTimeout(() => nextElement.focus(), 10)
          }
        }
      }
    }
  }

  // Get available dates within the selected span
  const getAvailableDatesInSpan = (span: DateSpan): string[] => {
    const dates: string[] = []
    const weekSessions = scheduleData.filter(s => s.week_number === showAddSessionModal)
    const existingDates = new Set(weekSessions.filter(s => s.date).map(s => s.date!.split('T')[0]))
    
    // Get today's date
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    let currentDate = new Date(span.start + 'T12:00:00') // Use noon to avoid timezone issues
    const endDate = new Date(span.end + 'T12:00:00')
    
    while (currentDate <= endDate) {
      const dateStr = formatDateLocal(currentDate)
      // Only include dates from today onwards that don't have sessions
      const currentDateMidnight = new Date(currentDate)
      currentDateMidnight.setHours(0, 0, 0, 0)
      if (currentDateMidnight >= today && !existingDates.has(dateStr)) {
        dates.push(dateStr)
      }
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    return dates
  }

  // Group schedule data by week
  const groupedByWeek = (): WeekGroup[] => {
    const groups: Map<number, ScheduleRow[]> = new Map()

    scheduleData.forEach(row => {
      const week = row.week_number || 0
      if (!groups.has(week)) {
        groups.set(week, [])
      }
      groups.get(week)!.push(row)
    })

    return Array.from(groups.entries())
      .sort(([a], [b]) => a - b)
      .map(([weekNumber, sessions]) => ({
        weekNumber,
        sessions: sessions.sort((a, b) => (a.session_number || 0) - (b.session_number || 0))
      }))
  }

  const toggleWeek = (weekNumber: number) => {
    setExpandedWeeks(prev => {
      const newSet = new Set(prev)
      if (newSet.has(weekNumber)) {
        newSet.delete(weekNumber)
      } else {
        newSet.add(weekNumber)
      }
      return newSet
    })
  }

  // Check if a session's date/time has passed
  const isSessionPast = (session: ScheduleRow): boolean => {
    if (!session.date) return false
    
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const sessionDate = new Date(session.date)
    sessionDate.setHours(0, 0, 0, 0)
    
    return sessionDate < today
  }

  const handleCellDoubleClick = (rowId: number, field: keyof ScheduleRow, value: any, session?: ScheduleRow) => {
    // Day column is never editable (auto-updates with date)
    if (field === 'day') {
      showToast('Day auto-updates when you change the date', 'error')
      return
    }
    
    // Prevent editing date, time for past sessions
    if (session && isSessionPast(session) && (field === 'date' || field === 'time')) {
      showToast('Cannot edit date/time for past sessions', 'error')
      return
    }
    
    setEditingCell({
      rowId,
      field,
      value: String(value || ''),
      originalValue: String(value || '')
    })
  }

  const handleSaveEdit = async (overrideValue?: string) => {
    if (!editingCell || isSaving) return

    const valueToSave = overrideValue !== undefined ? overrideValue : editingCell.value

    // If value hasn't changed, just cancel
    if (valueToSave === editingCell.originalValue) {
      setEditingCell(null)
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch('/api/cohort/schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableName,
          id: editingCell.rowId,
          field: editingCell.field,
          value: valueToSave || null
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update')
      }

      // Update local state
      setScheduleData(prev => prev.map(row =>
        row.id === editingCell.rowId
          ? { ...row, [editingCell.field]: valueToSave || null }
          : row
      ))

      showToast('Updated successfully', 'success')
      setEditingCell(null)
    } catch (err: any) {
      console.error('Error saving:', err)
      showToast(err.message || 'Failed to save', 'error')
      // Reset to original value
      setEditingCell(prev => prev ? { ...prev, value: prev.originalValue } : null)
    } finally {
      setIsSaving(false)
      isSelectingDropdown.current = false
    }
  }

  const handleCancelEdit = () => {
    setEditingCell(null)
  }

  // Find the next session for date validation
  const getNextSession = (currentRow: ScheduleRow): ScheduleRow | null => {
    const currentWeek = currentRow.week_number || 0
    const currentSession = currentRow.session_number || 0

    // Sort all sessions by week and session number
    const sortedSessions = [...scheduleData].sort((a, b) => {
      const weekDiff = (a.week_number || 0) - (b.week_number || 0)
      if (weekDiff !== 0) return weekDiff
      return (a.session_number || 0) - (b.session_number || 0)
    })

    // Find current index
    const currentIndex = sortedSessions.findIndex(row => row.id === currentRow.id)
    
    // Return the next session if exists
    if (currentIndex >= 0 && currentIndex < sortedSessions.length - 1) {
      return sortedSessions[currentIndex + 1]
    }

    return null
  }

  // Get the previous session for minimum date
  const getPreviousSession = (currentRow: ScheduleRow): ScheduleRow | null => {
    // Sort all sessions by week and session number
    const sortedSessions = [...scheduleData].sort((a, b) => {
      const weekDiff = (a.week_number || 0) - (b.week_number || 0)
      if (weekDiff !== 0) return weekDiff
      return (a.session_number || 0) - (b.session_number || 0)
    })

    // Find current index
    const currentIndex = sortedSessions.findIndex(row => row.id === currentRow.id)
    
    // Return the previous session if exists
    if (currentIndex > 0) {
      return sortedSessions[currentIndex - 1]
    }

    return null
  }

  // Helper to format date as YYYY-MM-DD in local timezone
  const formatDateLocal = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Get available dates for inline editing (between prev and next session, from today onwards)
  const getAvailableDatesForEdit = (currentRow: ScheduleRow): string[] => {
    const dates: string[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const prevSession = getPreviousSession(currentRow)
    const nextSession = getNextSession(currentRow)

    // Calculate min date (day after previous session, or today, whichever is later)
    let minDate = new Date(today)
    if (prevSession && prevSession.date) {
      const prevDateClean = String(prevSession.date).split('T')[0]
      const prevDateObj = new Date(prevDateClean + 'T12:00:00') // Use noon to avoid timezone issues
      prevDateObj.setDate(prevDateObj.getDate() + 1)
      if (prevDateObj > minDate) {
        minDate = prevDateObj
      }
    }

    // Calculate max date (day before next session, or min + 30 days if no next session)
    let maxDate: Date
    if (nextSession && nextSession.date) {
      const nextDateClean = String(nextSession.date).split('T')[0]
      maxDate = new Date(nextDateClean + 'T12:00:00') // Use noon to avoid timezone issues
      maxDate.setDate(maxDate.getDate() - 1)
    } else {
      maxDate = new Date(minDate)
      maxDate.setDate(maxDate.getDate() + 30)
    }

    // Get existing dates in schedule (to exclude)
    const existingDates = new Set(
      scheduleData
        .filter(s => s.id !== currentRow.id && s.date)
        .map(s => String(s.date).split('T')[0])
    )

    // Generate available dates (only from today onwards)
    let currentDate = new Date(minDate)
    currentDate.setHours(12, 0, 0, 0) // Use noon to avoid timezone issues
    
    while (currentDate <= maxDate) {
      const dateStr = formatDateLocal(currentDate)
      // Only include dates from today onwards that aren't taken
      if (!existingDates.has(dateStr)) {
        dates.push(dateStr)
      }
      currentDate.setDate(currentDate.getDate() + 1)
    }

    return dates
  }

  const renderEditInput = (column: typeof DISPLAY_COLUMNS[0], currentRow?: ScheduleRow) => {
    if (!editingCell) return null

    const commonProps = {
      disabled: isSaving,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          handleSaveEdit()
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          handleCancelEdit()
        }
      }
    }

    // Date dropdown for date field with available dates
    if (column.key === 'date' && currentRow) {
      const availableDates = getAvailableDatesForEdit(currentRow)
      const currentDateStr = editingCell.value ? editingCell.value.split('T')[0] : ''

      const handleDateChange = async (newDate: string) => {
        if (!newDate) return

        // Get the day name for the new date
        const dateObj = new Date(newDate + 'T00:00:00')
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        const newDayName = dayNames[dateObj.getDay()]

        // Update date
        isSelectingDropdown.current = true
        setEditingCell(prev => prev ? { ...prev, value: newDate } : null)
        
        // Save the date first
        await handleSaveEdit(newDate)

        // Then update the day automatically
        try {
          await fetch('/api/cohort/schedule', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tableName,
              id: currentRow.id,
              field: 'day',
              value: newDayName
            })
          })
          
          // Update local state for day as well
          setScheduleData(prev => prev.map(row =>
            row.id === currentRow.id
              ? { ...row, day: newDayName }
              : row
          ))
        } catch (err) {
          console.error('Error updating day:', err)
        }
      }

      return (
        <select
          value={currentDateStr}
          onMouseDown={() => { isSelectingDropdown.current = true }}
          onChange={(e) => handleDateChange(e.target.value)}
          onBlur={() => {
            setTimeout(() => {
              if (!isSelectingDropdown.current) {
                handleCancelEdit()
              }
            }, 150)
          }}
          className="w-full bg-background border border-primary rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          autoFocus
          {...commonProps}
        >
          <option value="">Select date...</option>
          {availableDates.map(date => {
            const dateObj = new Date(date + 'T00:00:00')
            const dayName = DAYS_OF_WEEK[dateObj.getDay()]
            const formatted = dateObj.toLocaleDateString('en-IN', { 
              day: 'numeric', 
              month: 'short', 
              year: 'numeric' 
            })
            return (
              <option key={date} value={date}>
                {formatted} ({dayName})
              </option>
            )
          })}
        </select>
      )
    }

    // Date dropdown without row context (fallback - shouldn't happen)
    if (column.key === 'date') {
      return (
        <input
          type="date"
          value={editingCell.value || ''}
          onChange={(e) => setEditingCell(prev => prev ? { ...prev, value: e.target.value } : null)}
          className="w-full bg-background border border-primary rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          autoFocus
          {...commonProps}
          onBlur={() => handleSaveEdit()}
        />
      )
    }

    // Day dropdown
    if (column.key === 'day') {
      return (
        <select
          value={editingCell.value || ''}
          onMouseDown={() => { isSelectingDropdown.current = true }}
          onChange={(e) => {
            const newValue = e.target.value
            isSelectingDropdown.current = true
            setEditingCell(prev => prev ? { ...prev, value: newValue } : null)
            // Pass value directly to save
            handleSaveEdit(newValue)
          }}
          className="w-full bg-background border border-primary rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          autoFocus
          {...commonProps}
        >
          <option value="">Select day</option>
          {DAYS_OF_WEEK.map(day => (
            <option key={day} value={day}>{day}</option>
          ))}
        </select>
      )
    }

    // Session type dropdown
    if (column.key === 'session_type') {
      return (
        <select
          value={editingCell.value || ''}
          onMouseDown={() => { isSelectingDropdown.current = true }}
          onChange={(e) => {
            const newValue = e.target.value
            isSelectingDropdown.current = true
            setEditingCell(prev => prev ? { ...prev, value: newValue } : null)
            handleSaveEdit(newValue)
          }}
          onBlur={() => {
            setTimeout(() => {
              if (!isSelectingDropdown.current) {
                handleCancelEdit()
              }
            }, 150)
          }}
          className="w-full bg-background border border-primary rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          autoFocus
          {...commonProps}
        >
          <option value="">Select type</option>
          {SESSION_TYPES.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      )
    }

    // Mentor dropdown
    if (column.key === 'mentor_id') {
      return (
        <select
          value={editingCell.value || ''}
          onMouseDown={() => { isSelectingDropdown.current = true }}
          onChange={(e) => {
            const newValue = e.target.value
            isSelectingDropdown.current = true
            setEditingCell(prev => prev ? { ...prev, value: newValue } : null)
            handleSaveEdit(newValue)
          }}
          onBlur={() => {
            setTimeout(() => {
              if (!isSelectingDropdown.current) {
                handleCancelEdit()
              }
            }, 150)
          }}
          className="w-full bg-background border border-primary rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          autoFocus
          {...commonProps}
        >
          <option value="">No mentor</option>
          {mentors.map(mentor => (
            <option key={mentor.id} value={mentor.id}>{mentor.name}</option>
          ))}
        </select>
      )
    }

    // Default text input
    return (
      <input
        type="text"
        value={editingCell.value}
        onChange={(e) => setEditingCell(prev => prev ? { ...prev, value: e.target.value } : null)}
        className="w-full bg-background border border-primary rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        autoFocus
        {...commonProps}
        onBlur={() => handleSaveEdit()}
      />
    )
  }

  const renderCell = (row: ScheduleRow, column: typeof DISPLAY_COLUMNS[0]) => {
    const isEditing = editingCell?.rowId === row.id && editingCell?.field === column.key
    const value = row[column.key]

    if (isEditing) {
      return (
        <div ref={editingCellRef} className="relative">
          {renderEditInput(column, row)}
          {isSaving && (
            <div className="absolute inset-0 bg-primary/20 rounded flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          )}
        </div>
      )
    }

    // Special rendering for different field types
    if (column.key === 'session_type') {
      return (
        <span className={cn(
          "px-2 py-0.5 rounded-full text-xs font-medium",
          value === 'live session' && "bg-green-500/20 text-green-400 border border-green-500/30",
          value === 'self paced' && "bg-blue-500/20 text-blue-400 border border-blue-500/30",
          value === 'project' && "bg-purple-500/20 text-purple-400 border border-purple-500/30",
          value === 'assignment' && "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
          value === 'contest' && "bg-orange-500/20 text-orange-400 border border-orange-500/30",
          !SESSION_TYPES.includes(String(value || '')) && "bg-muted/50 text-muted-foreground"
        )}>
          {value || '-'}
        </span>
      )
    }

    // Mentor ID - show mentor name
    if (column.key === 'mentor_id') {
      const mentor = mentors.find(m => m.id === Number(value))
      return mentor ? (
        <span className="text-foreground">{mentor.name}</span>
      ) : (
        <span className="text-muted-foreground">{value || '-'}</span>
      )
    }

    if (column.key === 'teams_meeting_link' || column.key === 'session_material' || column.key === 'session_recording' || column.key === 'initial_session_material') {
      const isValidUrl = value && String(value).trim() !== '' && String(value) !== 'null'
      return isValidUrl ? (
        <a
          href={String(value).startsWith('http') ? String(value) : `https://${value}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 underline truncate block max-w-[150px]"
          onClick={(e) => e.stopPropagation()}
        >
          {String(value).length > 25 ? String(value).substring(0, 25) + '...' : value}
        </a>
      ) : (
        <span className="text-muted-foreground">-</span>
      )
    }

    if (column.key === 'date') {
      if (!value) return <span className="text-muted-foreground">-</span>
      const date = new Date(value as string)
      return (
        <span className="font-medium">
          {date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      )
    }

    return <span className="truncate">{value || '-'}</span>
  }

  const editorTabs = [
    { id: 'postpone' as EditorTab, label: 'Postpone Class', icon: ArrowRight },
    { id: 'prepone' as EditorTab, label: 'Prepone Class', icon: ArrowLeft },
    { id: 'view' as EditorTab, label: 'Bulk Edit Cohort Schedules', icon: Edit3 },
    // { id: 'bulk-edit' as EditorTab, label: 'Bulk Edit', icon: Edit3 },
  ]

  const renderViewSchedule = () => {
    if (loadingSchedule) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Loading schedule...</span>
        </div>
      )
    }

    if (scheduleData.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Calendar className="h-12 w-12 mb-4 opacity-50" />
          <p>No schedule data found</p>
        </div>
      )
    }

    const weeks = groupedByWeek()

    return (
      <div className="space-y-4 p-4">
        {/* Refresh Button */}
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">
            {scheduleData.length} sessions across {weeks.length} weeks
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleBulkEditMode}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors",
                bulkEditMode
                  ? "bg-violet-500/20 text-violet-400 border border-violet-500/50"
                  : "bg-muted/50 hover:bg-muted"
              )}
            >
              <Edit3 className="h-4 w-4" />
              {bulkEditMode ? 'Exit Bulk Edit' : 'Bulk Edit'}
            </button>
            <button
              onClick={() => fetchScheduleData(tableName)}
              className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 hover:bg-muted rounded-lg text-sm transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Week Cards */}
        {weeks.map(({ weekNumber, sessions }) => (
          <div key={weekNumber} className="bg-card/50 border border-border/50 rounded-xl overflow-hidden relative">
            {/* Delete Confirmation Modal */}
            {showDeleteConfirm === weekNumber && (
              <div className="absolute inset-0 z-20 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-card border border-red-500/50 rounded-xl p-4 max-w-sm w-full space-y-4">
                  <div className="flex items-center gap-3 text-red-400">
                    <Trash2 className="h-6 w-6" />
                    <span className="font-semibold">Delete Week {weekNumber}?</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    This will delete all {sessions.length} sessions in this week and shift all subsequent weeks up.
                  </p>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setShowDeleteConfirm(null)}
                      className="px-4 py-2 bg-muted/50 hover:bg-muted rounded-lg text-sm transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDeleteWeek(weekNumber)}
                      disabled={deletingWeek === weekNumber}
                      className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/50 rounded-lg text-sm transition-colors flex items-center gap-2"
                    >
                      {deletingWeek === weekNumber ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4" />
                          Delete Week
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Week Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-500/10 to-cyan-500/10">
              <button
                onClick={() => toggleWeek(weekNumber)}
                className="flex items-center gap-3 hover:opacity-80 transition-opacity"
              >
                {expandedWeeks.has(weekNumber) ? (
                  <ChevronDown className="h-5 w-5 text-blue-400" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-blue-400" />
                )}
                <span className="font-semibold text-lg bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                  Week {weekNumber}
                </span>
                <span className="text-sm text-muted-foreground">
                  ({sessions.length} session{sessions.length > 1 ? 's' : ''})
                </span>
              </button>
              <div className="flex items-center gap-3">
                <div className="flex gap-2">
                  {sessions.map(s => (
                    <span
                      key={s.id}
                      className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium",
                        s.session_type === 'live session' ? "bg-green-500/20 text-green-400" : "bg-blue-500/20 text-blue-400"
                      )}
                    >
                      S{s.session_number}
                    </span>
                  ))}
                </div>
                {/* Add Session Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleOpenAddSession(weekNumber)
                  }}
                  className="p-1.5 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 transition-colors"
                  title="Add session to this week"
                >
                  <Plus className="h-4 w-4" />
                </button>
                {/* Delete Week Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowDeleteConfirm(weekNumber)
                  }}
                  className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                  title="Delete this week"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Sessions Table */}
            {expandedWeeks.has(weekNumber) && (
              <div className="overflow-x-auto scrollbar-hide-until-scroll">
                <table className="w-full min-w-max">
                  <thead className="bg-muted/30">
                    <tr>
                      {/* Checkbox column - only show in bulk edit mode */}
                      {bulkEditMode && (
                        <th className="px-3 py-2 text-center text-xs font-semibold text-foreground whitespace-nowrap w-12">
                          <input
                            type="checkbox"
                            checked={sessions.every(s => selectedSessions.has(s.id))}
                            onChange={() => toggleSelectAllInWeek(weekNumber)}
                            className="w-4 h-4 rounded border-border bg-muted accent-violet-500 cursor-pointer"
                            title="Select all in this week"
                          />
                        </th>
                      )}
                      <th className="px-3 py-2 text-left text-xs font-semibold text-foreground whitespace-nowrap w-16">
                        Session
                      </th>
                      {DISPLAY_COLUMNS.map(col => (
                        <th
                          key={col.key}
                          className={cn("px-3 py-2 text-left text-xs font-semibold text-foreground whitespace-nowrap", col.width)}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {sessions.map((session) => (
                      <tr 
                        key={session.id} 
                        className={cn(
                          "hover:bg-muted/20 transition-colors",
                          bulkEditMode && selectedSessions.has(session.id) && "bg-violet-500/10"
                        )}
                      >
                        {/* Checkbox - only show in bulk edit mode */}
                        {bulkEditMode && (
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={selectedSessions.has(session.id)}
                              onChange={() => toggleSessionSelection(session.id)}
                              className="w-4 h-4 rounded border-border bg-muted accent-violet-500 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="px-3 py-2 text-sm">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-400 font-bold">
                            {session.session_number}
                          </span>
                        </td>
                        {DISPLAY_COLUMNS.map(col => {
                          const isPastSession = isSessionPast(session)
                          const isDateTimeField = col.key === 'date' || col.key === 'time'
                          const isDayField = col.key === 'day'
                          const isPastRestricted = isPastSession && isDateTimeField
                          const isNonEditable = isDayField || isPastRestricted
                          
                          return (
                            <td
                              key={col.key}
                              className={cn(
                                "px-3 py-2 text-sm transition-colors",
                                col.width,
                                isNonEditable 
                                  ? "cursor-not-allowed opacity-60" 
                                  : "cursor-pointer hover:bg-primary/10"
                              )}
                              onDoubleClick={() => handleCellDoubleClick(session.id, col.key, session[col.key], session)}
                              title={
                                isDayField 
                                  ? "Day auto-updates with date" 
                                  : isPastRestricted 
                                    ? "Cannot edit - session date has passed" 
                                    : "Double-click to edit"
                              }
                            >
                              {renderCell(session, col)}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}

        {/* Edit Instructions */}
        <div className="text-center py-4 text-sm text-muted-foreground border-t border-border/30">
          💡 <strong>Tip:</strong> Double-click any cell to edit. Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Enter</kbd> to save or <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Esc</kbd> to cancel.
        </div>
      </div>
    )
  }

  // Render Postpone Tab
  const renderPostponeTab = () => {
    const uniqueWeeks = getUniqueWeekNumbers()
    const uniqueDates = getUniqueDates()
    const uniqueTypes = getUniqueSessionTypes()
    const filteredSubjects = getFilteredSubjectNames()
    const filteredSessions = getFilteredSessions()
    const availableDates = selectedSessionId ? getPostponeDates() : []

    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-xl bg-orange-500/10">
            <ArrowRight className="h-6 w-6 text-orange-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Postpone Class</h3>
            <p className="text-sm text-muted-foreground">Move a session to a later date</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Week Number Filter */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Week Number</label>
            <select
              value={selectedWeekNumber}
              onChange={(e) => {
                setSelectedWeekNumber(e.target.value)
                setSelectedSessionDate('')
                setSelectedSessionType('')
                setSelectedSubjectName('')
                setSelectedSessionId(null)
                setNewDateForMove('')
                setNewTimeForMove('')
              }}
              className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-foreground"
            >
              <option value="">All weeks</option>
              {uniqueWeeks.map(week => (
                <option key={week} value={week}>Week {week}</option>
              ))}
            </select>
          </div>

          {/* Date Filter */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Current Date</label>
            <select
              value={selectedSessionDate}
              onChange={(e) => {
                setSelectedSessionDate(e.target.value)
                setSelectedSessionId(null)
                setNewDateForMove('')
                setNewTimeForMove('')
              }}
              className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-foreground"
            >
              <option value="">All dates</option>
              {uniqueDates.map(date => {
                const dateObj = new Date(date + 'T12:00:00')
                const formatted = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                return <option key={date} value={date}>{formatted}</option>
              })}
            </select>
          </div>

          {/* Session Type Filter */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Session Type</label>
            <select
              value={selectedSessionType}
              onChange={(e) => {
                setSelectedSessionType(e.target.value)
                setSelectedSessionId(null)
                setNewDateForMove('')
                setNewTimeForMove('')
              }}
              className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-foreground"
            >
              <option value="">All types</option>
              {uniqueTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          {/* Subject Name Filter */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Subject Name</label>
            <select
              value={selectedSubjectName}
              onChange={(e) => {
                setSelectedSubjectName(e.target.value)
                setSelectedSessionId(null)
                setNewDateForMove('')
                setNewTimeForMove('')
              }}
              className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-foreground"
            >
              <option value="">All subjects</option>
              {filteredSubjects.map(subject => (
                <option key={subject} value={subject}>{subject}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Matching Sessions */}
        {(selectedWeekNumber || selectedSessionDate || selectedSessionType || selectedSubjectName) && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground">
              Select Session ({filteredSessions.length} found)
            </label>
            <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
              {filteredSessions.map(session => {
                const dateStr = session.date ? new Date(String(session.date).split('T')[0] + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '-'
                return (
                  <label
                    key={session.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                      selectedSessionId === session.id
                        ? "bg-orange-500/10 border-orange-500/50"
                        : "bg-muted/20 border-border/50 hover:bg-muted/40"
                    )}
                  >
                    <input
                      type="radio"
                      name="postponeSession"
                      checked={selectedSessionId === session.id}
                      onChange={() => {
                        setSelectedSessionId(session.id)
                        setNewDateForMove('')
                        setNewTimeForMove('')
                      }}
                      className="w-4 h-4 accent-orange-500"
                    />
                    <div className="flex-1">
                      <span className="font-medium">{session.subject_name || 'Untitled'}</span>
                      <span className="text-muted-foreground text-sm ml-2">
                        W{session.week_number} S{session.session_number} • {dateStr} • {session.session_type}
                      </span>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {/* New Date & Time Selection */}
        {selectedSessionId && (
          <div className="space-y-4 p-4 bg-orange-500/5 border border-orange-500/30 rounded-xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Date Selection */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-orange-400">
                  New Date ({availableDates.length} available)
                </label>
                {availableDates.length > 0 ? (
                  <select
                    value={newDateForMove}
                    onChange={(e) => setNewDateForMove(e.target.value)}
                    className="w-full px-4 py-3 bg-muted/30 border border-orange-500/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-foreground"
                  >
                    <option value="">Keep current date</option>
                    {availableDates.map(date => {
                      const dateObj = new Date(date + 'T12:00:00')
                      const dayName = DAYS_OF_WEEK[dateObj.getDay()]
                      const formatted = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                      return <option key={date} value={date}>{formatted} ({dayName})</option>
                    })}
                  </select>
                ) : (
                  <p className="text-sm text-amber-400">No later dates available</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Current: {(() => {
                    const d = getSelectedSessionDate()
                    if (!d) return 'Not set'
                    const dateObj = new Date(d + 'T12:00:00')
                    return dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                  })()}
                </p>
              </div>

              {/* Time Selection */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-orange-400">
                  New Time
                </label>
                <input
                  type="time"
                  value={newTimeForMove || getSelectedSessionTime()?.substring(0, 5) || ''}
                  onChange={(e) => setNewTimeForMove(e.target.value)}
                  className="w-full px-4 py-3 bg-muted/30 border border-orange-500/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-foreground"
                />
                {!newDateForMove && (
                  <p className="text-xs text-amber-400">
                    {getTimeConstraintText('postpone')}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action Button */}
        {selectedSessionId && (
          <button
            onClick={() => handleMoveSession('postpone')}
            disabled={isMovingSession}
            className="w-full py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isMovingSession ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Postponing...
              </>
            ) : (
              <>
                <ArrowRight className="h-5 w-5" />
                Postpone Session
              </>
            )}
          </button>
        )}
      </div>
    )
  }

  // Render Prepone Tab
  const renderPreponeTab = () => {
    const uniqueWeeks = getUniqueWeekNumbers()
    const uniqueDates = getUniqueDates()
    const uniqueTypes = getUniqueSessionTypes()
    const filteredSubjects = getFilteredSubjectNames()
    const filteredSessions = getFilteredSessions()
    const availableDates = selectedSessionId ? getPreponeDates() : []

    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 rounded-xl bg-cyan-500/10">
            <ArrowLeft className="h-6 w-6 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Prepone Class</h3>
            <p className="text-sm text-muted-foreground">Move a session to an earlier date</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Week Number Filter */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Week Number</label>
            <select
              value={selectedWeekNumber}
              onChange={(e) => {
                setSelectedWeekNumber(e.target.value)
                setSelectedSessionDate('')
                setSelectedSessionType('')
                setSelectedSubjectName('')
                setSelectedSessionId(null)
                setNewDateForMove('')
                setNewTimeForMove('')
              }}
              className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 text-foreground"
            >
              <option value="">All weeks</option>
              {uniqueWeeks.map(week => (
                <option key={week} value={week}>Week {week}</option>
              ))}
            </select>
          </div>

          {/* Date Filter */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Current Date</label>
            <select
              value={selectedSessionDate}
              onChange={(e) => {
                setSelectedSessionDate(e.target.value)
                setSelectedSessionId(null)
                setNewDateForMove('')
                setNewTimeForMove('')
              }}
              className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 text-foreground"
            >
              <option value="">All dates</option>
              {uniqueDates.map(date => {
                const dateObj = new Date(date + 'T12:00:00')
                const formatted = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                return <option key={date} value={date}>{formatted}</option>
              })}
            </select>
          </div>

          {/* Session Type Filter */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Session Type</label>
            <select
              value={selectedSessionType}
              onChange={(e) => {
                setSelectedSessionType(e.target.value)
                setSelectedSessionId(null)
                setNewDateForMove('')
                setNewTimeForMove('')
              }}
              className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 text-foreground"
            >
              <option value="">All types</option>
              {uniqueTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          {/* Subject Name Filter */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Subject Name</label>
            <select
              value={selectedSubjectName}
              onChange={(e) => {
                setSelectedSubjectName(e.target.value)
                setSelectedSessionId(null)
                setNewDateForMove('')
                setNewTimeForMove('')
              }}
              className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 text-foreground"
            >
              <option value="">All subjects</option>
              {filteredSubjects.map(subject => (
                <option key={subject} value={subject}>{subject}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Matching Sessions */}
        {(selectedWeekNumber || selectedSessionDate || selectedSessionType || selectedSubjectName) && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground">
              Select Session ({filteredSessions.length} found)
            </label>
            <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
              {filteredSessions.map(session => {
                const dateStr = session.date ? new Date(String(session.date).split('T')[0] + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '-'
                return (
                  <label
                    key={session.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                      selectedSessionId === session.id
                        ? "bg-cyan-500/10 border-cyan-500/50"
                        : "bg-muted/20 border-border/50 hover:bg-muted/40"
                    )}
                  >
                    <input
                      type="radio"
                      name="preponeSession"
                      checked={selectedSessionId === session.id}
                      onChange={() => {
                        setSelectedSessionId(session.id)
                        setNewDateForMove('')
                        setNewTimeForMove('')
                      }}
                      className="w-4 h-4 accent-cyan-500"
                    />
                    <div className="flex-1">
                      <span className="font-medium">{session.subject_name || 'Untitled'}</span>
                      <span className="text-muted-foreground text-sm ml-2">
                        W{session.week_number} S{session.session_number} • {dateStr} • {session.session_type}
                      </span>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {/* New Date & Time Selection */}
        {selectedSessionId && (
          <div className="space-y-4 p-4 bg-cyan-500/5 border border-cyan-500/30 rounded-xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Date Selection */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-cyan-400">
                  New Date ({availableDates.length} available)
                </label>
                {availableDates.length > 0 ? (
                  <select
                    value={newDateForMove}
                    onChange={(e) => setNewDateForMove(e.target.value)}
                    className="w-full px-4 py-3 bg-muted/30 border border-cyan-500/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 text-foreground"
                  >
                    <option value="">Keep current date</option>
                    {availableDates.map(date => {
                      const dateObj = new Date(date + 'T12:00:00')
                      const dayName = DAYS_OF_WEEK[dateObj.getDay()]
                      const formatted = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                      return <option key={date} value={date}>{formatted} ({dayName})</option>
                    })}
                  </select>
                ) : (
                  <p className="text-sm text-amber-400">No earlier dates available</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Current: {(() => {
                    const d = getSelectedSessionDate()
                    if (!d) return 'Not set'
                    const dateObj = new Date(d + 'T12:00:00')
                    return dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                  })()}
                </p>
              </div>

              {/* Time Selection */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-cyan-400">
                  New Time
                </label>
                <input
                  type="time"
                  value={newTimeForMove || getSelectedSessionTime()?.substring(0, 5) || ''}
                  onChange={(e) => setNewTimeForMove(e.target.value)}
                  className="w-full px-4 py-3 bg-muted/30 border border-cyan-500/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 text-foreground"
                />
                {!newDateForMove && (
                  <p className="text-xs text-amber-400">
                    {getTimeConstraintText('prepone')}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action Button */}
        {selectedSessionId && (
          <button
            onClick={() => handleMoveSession('prepone')}
            disabled={isMovingSession}
            className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isMovingSession ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Preponing...
              </>
            ) : (
              <>
                <ArrowLeft className="h-5 w-5" />
                Prepone Session
              </>
            )}
          </button>
        )}
      </div>
    )
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'view':
        return renderViewSchedule()
      case 'postpone':
        return renderPostponeTab()
      case 'prepone':
        return renderPreponeTab()
      case 'bulk-edit':
        return (
          <div className="p-6 text-center text-muted-foreground">
            <Edit3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Bulk Edit content will be added here</p>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="w-full h-full p-4 sm:p-6 overflow-auto relative">
      {/* Full-screen Loading Overlay */}
      {isRefreshingAfterDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* Blurred Backdrop */}
          <div className="absolute inset-0 bg-background/60 backdrop-blur-md" />
          
          {/* Loading Content */}
          <div className="relative z-10 flex flex-col items-center gap-6 p-8 bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl">
            {/* Animated Loader */}
            <div className="relative">
              <div className="w-16 h-16 border-4 border-primary/20 rounded-full" />
              <div className="absolute top-0 left-0 w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
            
            {/* Status Text */}
            <div className="text-center space-y-2">
              <h3 className="text-xl font-semibold text-foreground">
                {deletingWeek ? `Deleting Week ${deletingWeek}...` : 'Refreshing Schedule...'}
              </h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                Please wait while we update the schedule and recalculate all dates
              </p>
            </div>

            {/* Progress Indicator */}
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        <div className="bg-card/50 backdrop-blur-xl border border-border/50 rounded-2xl shadow-xl p-6">
          {/* Header */}
          <div className="mb-6">
            <h2 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Cohort Schedule Editor
            </h2>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base">
              Select a cohort to view and edit its schedule
            </p>
          </div>

          {/* Cohort Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Cohort Type */}
            <div className="space-y-2">
              <label htmlFor="editorCohortType" className="block text-sm font-medium text-foreground">
                Cohort Type
              </label>
              <select
                id="editorCohortType"
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
              <label htmlFor="editorCohortNumber" className="block text-sm font-medium text-foreground">
                Cohort Number
              </label>
              <select
                id="editorCohortNumber"
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
            </div>
          </div>

          {/* Loading State */}
          {checkingCohort && (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Checking cohort...</span>
            </div>
          )}

          {/* Cohort Not Found */}
          {!checkingCohort && cohortExists === false && cohortType && cohortNumber && (
            <div className="p-6 bg-amber-500/10 border border-amber-500/50 rounded-xl">
              <div className="flex items-start gap-4">
                <AlertTriangle className="h-8 w-8 text-amber-500 flex-shrink-0" />
                <div>
                  <h3 className="text-lg font-semibold text-amber-500">Cohort Not Initiated</h3>
                  <p className="text-amber-400/80 mt-2">
                    The cohort <strong>{cohortType} {cohortNumber}</strong> has not been initiated yet.
                  </p>
                  <p className="text-amber-400/80 mt-1">
                    Please head on to the <strong>Cohort Initiator</strong> tab to create this cohort schedule first.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Cohort Found - Show Editor Tabs */}
          {!checkingCohort && cohortExists === true && (
            <div className="space-y-4">
              {/* Cohort Info Badge */}
              <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/50 rounded-xl">
                <Calendar className="h-5 w-5 text-green-500" />
                <span className="text-green-500 font-medium">
                  Editing: {cohortType.charAt(0).toUpperCase() + cohortType.slice(1)} {cohortNumber}
                </span>
                <span className="text-green-400/70 text-sm">({tableName})</span>
              </div>

              {/* Tab Navigation */}
              <div className="flex flex-wrap gap-2 border-b border-border/50 pb-2">
                {editorTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id)
                      resetMoveSelections()
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                      activeTab === tab.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`}
                  >
                    <tab.icon className="h-4 w-4" />
                    <span className="text-sm font-medium">{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="bg-muted/20 border border-border/30 rounded-xl min-h-[400px] overflow-hidden">
                {renderTabContent()}
              </div>
            </div>
          )}

          {/* Empty State - No Selection */}
          {!checkingCohort && cohortExists === null && (!cohortType || !cohortNumber) && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Clock className="h-16 w-16 mb-4 opacity-30" />
              <p className="text-lg">Select a cohort to get started</p>
              <p className="text-sm mt-1">Choose cohort type and number above</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Session Modal */}
      {showAddSessionModal !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowAddSessionModal(null)}
          />
          
          {/* Modal Content */}
          <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-card border border-border/50 rounded-2xl shadow-2xl scrollbar-hide">
            {/* Modal Header */}
            <div className="sticky top-0 bg-card border-b border-border/50 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
                  Add Session to Week {showAddSessionModal}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Fill in the session details below
                </p>
              </div>
              <button
                onClick={() => setShowAddSessionModal(null)}
                className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Date Selection */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-foreground">
                  Select Date <span className="text-red-400">*</span>
                </label>
                
                {availableDateSpans.length === 0 ? (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/50 rounded-xl text-amber-400 text-sm">
                    No available dates in this week. All dates are occupied by existing sessions.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Available date ranges in this week:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {availableDateSpans.map((span, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1.5 bg-violet-500/10 border border-violet-500/30 rounded-lg text-violet-400 text-sm"
                        >
                          {span.label}
                        </span>
                      ))}
                    </div>
                    
                    {/* Date Picker */}
                    <div className="mt-3">
                      <select
                        value={newSessionForm.selectedDate}
                        onChange={(e) => setNewSessionForm(prev => ({ ...prev, selectedDate: e.target.value }))}
                        className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-foreground"
                      >
                        <option value="">Choose a date...</option>
                        {availableDateSpans.flatMap(span => {
                          const dates = getAvailableDatesInSpan(span)
                          return dates.map(date => {
                            const dateObj = new Date(date + 'T00:00:00')
                            const dayName = DAYS_OF_WEEK[dateObj.getDay()]
                            const formatted = dateObj.toLocaleDateString('en-IN', { 
                              day: 'numeric', 
                              month: 'short', 
                              year: 'numeric' 
                            })
                            return (
                              <option key={date} value={date}>
                                {formatted} ({dayName})
                              </option>
                            )
                          })
                        })}
                      </select>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Two column grid for other fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Session Type */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">Session Type</label>
                  <select
                    value={newSessionForm.session_type}
                    onChange={(e) => setNewSessionForm(prev => ({ ...prev, session_type: e.target.value }))}
                    className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                  >
                    {SESSION_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                
                {/* Time */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">Time</label>
                  <input
                    type="time"
                    value={newSessionForm.time}
                    onChange={(e) => setNewSessionForm(prev => ({ ...prev, time: e.target.value }))}
                    className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                  />
                </div>
                
                {/* Subject Type */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">Subject Type</label>
                  <input
                    type="text"
                    value={newSessionForm.subject_type}
                    onChange={(e) => setNewSessionForm(prev => ({ ...prev, subject_type: e.target.value }))}
                    placeholder="e.g., DSA, Web Dev"
                    className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                
                {/* Subject Name */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">Subject Name</label>
                  <input
                    type="text"
                    value={newSessionForm.subject_name}
                    onChange={(e) => setNewSessionForm(prev => ({ ...prev, subject_name: e.target.value }))}
                    placeholder="e.g., Arrays, React Basics"
                    className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                
                {/* Subject Topic */}
                <div className="space-y-2 md:col-span-2">
                  <label className="block text-sm font-medium text-foreground">Subject Topic</label>
                  <input
                    type="text"
                    value={newSessionForm.subject_topic}
                    onChange={(e) => setNewSessionForm(prev => ({ ...prev, subject_topic: e.target.value }))}
                    placeholder="e.g., Two Pointer Technique"
                    className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                
                {/* Mentor */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">Mentor</label>
                  <select
                    value={newSessionForm.mentor_id}
                    onChange={(e) => setNewSessionForm(prev => ({ ...prev, mentor_id: e.target.value }))}
                    className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
                  >
                    <option value="">No mentor assigned</option>
                    {mentors.map(mentor => (
                      <option key={mentor.id} value={mentor.id}>{mentor.name}</option>
                    ))}
                  </select>
                </div>
                
                {/* Initial Session Material */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">Initial Material Link</label>
                  <input
                    type="url"
                    value={newSessionForm.initial_session_material}
                    onChange={(e) => setNewSessionForm(prev => ({ ...prev, initial_session_material: e.target.value }))}
                    onBlur={(e) => handleUrlBlur(e, 'initial_session_material')}
                    onKeyDown={(e) => handleUrlKeyDown(e, 'initial_session_material')}
                    placeholder="https://..."
                    className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                
                {/* Session Material */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">Session Material Link</label>
                  <input
                    type="url"
                    value={newSessionForm.session_material}
                    onChange={(e) => setNewSessionForm(prev => ({ ...prev, session_material: e.target.value }))}
                    onBlur={(e) => handleUrlBlur(e, 'session_material')}
                    onKeyDown={(e) => handleUrlKeyDown(e, 'session_material')}
                    placeholder="https://..."
                    className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                
                {/* Session Recording */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-foreground">Recording Link</label>
                  <input
                    type="url"
                    value={newSessionForm.session_recording}
                    onChange={(e) => setNewSessionForm(prev => ({ ...prev, session_recording: e.target.value }))}
                    onBlur={(e) => handleUrlBlur(e, 'session_recording')}
                    onKeyDown={(e) => handleUrlKeyDown(e, 'session_recording')}
                    placeholder="https://..."
                    className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-card border-t border-border/50 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => setShowAddSessionModal(null)}
                className="px-4 py-2 bg-muted/50 hover:bg-muted rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSession}
                disabled={addingSession || !newSessionForm.selectedDate || availableDateSpans.length === 0}
                className="px-6 py-2 bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addingSession ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Add Session
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Selection Action Bar - only in bulk edit mode */}
      {bulkEditMode && selectedSessions.size > 0 && (
        <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 bg-card/95 backdrop-blur-xl border border-primary/50 rounded-2xl shadow-2xl flex items-center gap-4">
          <span className="text-sm font-medium text-foreground">
            {selectedSessions.size} session{selectedSessions.size > 1 ? 's' : ''} selected
          </span>
          <div className="h-6 w-px bg-border" />
          <button
            onClick={openBulkEditModal}
            className="px-4 py-2 bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Edit3 className="h-4 w-4" />
            Bulk Edit
          </button>
          <button
            onClick={clearSelection}
            className="px-3 py-2 bg-muted/50 hover:bg-muted rounded-lg text-sm transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Bulk Edit Modal */}
      {showBulkEditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowBulkEditModal(false)}
          />
          
          {/* Modal Content */}
          <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-card border border-border/50 rounded-2xl shadow-2xl scrollbar-hide">
            {/* Modal Header */}
            <div className="sticky top-0 bg-card border-b border-border/50 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
                  Bulk Edit {selectedSessions.size} Sessions
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {bulkEditStep === 1 ? 'Step 1: Select fields to edit' : 'Step 2: Enter new values'}
                </p>
              </div>
              <button
                onClick={() => setShowBulkEditModal(false)}
                className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-6">
              {bulkEditStep === 1 ? (
                /* Step 1: Select Fields */
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground mb-4">
                    Select which fields you want to update:
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {BULK_EDITABLE_FIELDS.map(field => (
                      <label
                        key={field.key}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                          selectedBulkFields.has(field.key)
                            ? "bg-violet-500/10 border-violet-500/50"
                            : "bg-muted/20 border-border/50 hover:bg-muted/40"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selectedBulkFields.has(field.key)}
                          onChange={() => toggleBulkField(field.key)}
                          className="w-4 h-4 rounded border-border bg-muted accent-violet-500"
                        />
                        <span className="text-foreground">{field.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                /* Step 2: Enter Values */
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground mb-4">
                    Enter values for the selected fields:
                  </p>
                  {Array.from(selectedBulkFields).map(fieldKey => {
                    const field = BULK_EDITABLE_FIELDS.find(f => f.key === fieldKey)
                    if (!field) return null

                    return (
                      <div key={field.key} className="space-y-2">
                        <label className="block text-sm font-medium text-foreground">
                          {field.label}
                        </label>
                        
                        {field.type === 'dropdown' && field.key === 'session_type' ? (
                          <select
                            value={bulkEditValues[field.key] || ''}
                            onChange={(e) => setBulkEditValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                            className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-foreground"
                          >
                            <option value="">Select type...</option>
                            {SESSION_TYPES.map(type => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        ) : field.type === 'dropdown' && field.key === 'mentor_id' ? (
                          <select
                            value={bulkEditValues[field.key] || ''}
                            onChange={(e) => setBulkEditValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                            className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-foreground"
                          >
                            <option value="">Select mentor...</option>
                            {mentors.map(mentor => (
                              <option key={mentor.id} value={mentor.id}>{mentor.name}</option>
                            ))}
                          </select>
                        ) : field.type === 'time' ? (
                          <input
                            type="time"
                            value={bulkEditValues[field.key] || ''}
                            onChange={(e) => setBulkEditValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                            className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-foreground"
                          />
                        ) : (
                          <input
                            type="text"
                            value={bulkEditValues[field.key] || ''}
                            onChange={(e) => setBulkEditValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                            placeholder={`Enter ${field.label.toLowerCase()}...`}
                            className="w-full px-4 py-3 bg-muted/30 border border-border/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-foreground placeholder:text-muted-foreground"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-card border-t border-border/50 px-6 py-4 flex justify-between gap-3">
              {bulkEditStep === 2 && (
                <button
                  onClick={() => setBulkEditStep(1)}
                  className="px-4 py-2 bg-muted/50 hover:bg-muted rounded-lg text-sm transition-colors"
                >
                  Back
                </button>
              )}
              <div className="flex gap-3 ml-auto">
                <button
                  onClick={() => setShowBulkEditModal(false)}
                  className="px-4 py-2 bg-muted/50 hover:bg-muted rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
                {bulkEditStep === 1 ? (
                  <button
                    onClick={proceedToStep2}
                    disabled={selectedBulkFields.size === 0}
                    className="px-6 py-2 bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleBulkSave}
                    disabled={isBulkSaving}
                    className="px-6 py-2 bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isBulkSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Apply to {selectedSessions.size} Sessions
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage.show && (
        <div
          className={cn(
            "fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 px-6 py-4 rounded-xl backdrop-blur-lg border transition-all duration-500 ease-out",
            toastMessage.type === 'success'
              ? "bg-green-500/20 border-green-500/30 text-green-300 shadow-lg shadow-green-500/20"
              : "bg-red-500/20 border-red-500/30 text-red-300 shadow-lg shadow-red-500/20"
          )}
        >
          <span className="text-sm font-medium">{toastMessage.message}</span>
        </div>
      )}
    </div>
  )
}
