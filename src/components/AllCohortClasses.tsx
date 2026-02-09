'use client'

import { useState, useEffect } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Users, BookOpen, Clock, MapPin, Video, AlertTriangle, CheckCircle, Calendar as CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ClassData {
  id: number
  cohort: string
  cohortTable: string
  weekNumber: number
  sessionNumber: number
  date: string
  time: string | null
  day: string | null
  sessionType: string | null
  subjectType: string | null
  subjectName: string | null
  subjectTopic: string | null
  mentorId: number | null
  mentorName: string
  originalMentorId: number | null
  originalMentorName: string
  isSwapped: boolean
  hasRecording: boolean
  teamsLink: string | null
  status: 'present' | 'absent' | 'upcoming' | 'unknown'
}

interface ClassesByDate {
  [date: string]: ClassData[]
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function AllCohortClasses() {
  const [classesByDate, setClassesByDate] = useState<ClassesByDate>({})
  const [allClasses, setAllClasses] = useState<ClassData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [totalCohorts, setTotalCohorts] = useState(0)

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    present: 0,
    absent: 0,
    upcoming: 0
  })

  useEffect(() => {
    fetchClasses()
  }, [currentDate])

  const fetchClasses = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const year = currentDate.getFullYear()
      const month = currentDate.getMonth() + 1 // 1-indexed

      const response = await fetch(`/api/all-cohort-classes?year=${year}&month=${month}`)
      const result = await response.json()

      if (result.success) {
        setClassesByDate(result.classesByDate || {})
        setAllClasses(result.allClasses || [])
        setTotalCohorts(result.cohorts || 0)

        // Calculate stats
        const classes = result.allClasses || []
        setStats({
          total: classes.length,
          present: classes.filter((c: ClassData) => c.status === 'present').length,
          absent: classes.filter((c: ClassData) => c.status === 'absent').length,
          upcoming: classes.filter((c: ClassData) => c.status === 'upcoming').length
        })
      } else {
        throw new Error(result.error || 'Failed to fetch classes')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const goToPreviousMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
    setSelectedDate(null)
  }

  const goToNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
    setSelectedDate(null)
  }

  const goToToday = () => {
    setCurrentDate(new Date())
    setSelectedDate(null)
  }

  // Generate calendar days
  const generateCalendarDays = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    
    const firstDayOfMonth = new Date(year, month, 1)
    const lastDayOfMonth = new Date(year, month + 1, 0)
    
    const startingDayOfWeek = firstDayOfMonth.getDay()
    const daysInMonth = lastDayOfMonth.getDate()
    
    const days: { date: Date | null; dateStr: string; isCurrentMonth: boolean }[] = []
    
    // Add empty slots for days before the first day of month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push({ date: null, dateStr: '', isCurrentMonth: false })
    }
    
    // Add days of current month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day)
      const dateStr = date.toISOString().split('T')[0]
      days.push({ date, dateStr, isCurrentMonth: true })
    }
    
    return days
  }

  const calendarDays = generateCalendarDays()
  const today = new Date().toISOString().split('T')[0]

  // Get classes for selected date
  const selectedClasses = selectedDate ? (classesByDate[selectedDate] || []) : []

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present':
        return 'bg-green-500'
      case 'absent':
        return 'bg-red-500'
      case 'upcoming':
        return 'bg-blue-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getStatusBgColor = (status: string) => {
    switch (status) {
      case 'present':
        return 'bg-green-500/10 border-green-500/30 hover:bg-green-500/20'
      case 'absent':
        return 'bg-red-500/10 border-red-500/30 hover:bg-red-500/20'
      case 'upcoming':
        return 'bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20'
      default:
        return 'bg-gray-500/10 border-gray-500/30 hover:bg-gray-500/20'
    }
  }

  const getStatusTextColor = (status: string) => {
    switch (status) {
      case 'present':
        return 'text-green-400'
      case 'absent':
        return 'text-red-400'
      case 'upcoming':
        return 'text-blue-400'
      default:
        return 'text-gray-400'
    }
  }

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="relative mb-8">
          <div className="w-32 h-32 rounded-full border-4 border-transparent border-t-teal-500 border-r-emerald-500 animate-spin" />
          <div className="absolute inset-2 w-28 h-28 rounded-full border-4 border-transparent border-b-green-400 border-l-cyan-500 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 bg-gradient-to-br from-teal-500 via-emerald-500 to-green-500 rounded-xl flex items-center justify-center shadow-lg shadow-teal-500/50 animate-pulse">
              <CalendarDays className="w-8 h-8 text-white" />
            </div>
          </div>
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-teal-400 via-emerald-400 to-green-400 bg-clip-text text-transparent mb-3">
            Loading All Classes
          </h2>
          <p className="text-sm text-muted-foreground">Fetching classes from all cohorts...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="w-20 h-20 bg-destructive/20 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle className="w-10 h-10 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Error Loading Data</h2>
        <p className="text-muted-foreground mb-6">{error}</p>
        <button
          onClick={fetchClasses}
          className="px-6 py-3 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-xl hover:scale-105 transition-all duration-300 font-medium shadow-lg shadow-teal-500/30 flex items-center space-x-2"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Retry</span>
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-gradient-to-br from-teal-500 via-emerald-500 to-green-500 rounded-xl flex items-center justify-center shadow-lg shadow-teal-500/30">
            <CalendarDays className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-teal-400 via-emerald-400 to-green-400 bg-clip-text text-transparent">
              All Cohort Classes
            </h1>
            <p className="text-muted-foreground">
              {totalCohorts} cohorts • {stats.total} classes this month
            </p>
          </div>
        </div>

        <button
          onClick={fetchClasses}
          disabled={isLoading}
          className="px-4 py-2 bg-gradient-to-r from-teal-500/20 via-emerald-500/20 to-green-500/20 hover:from-teal-500/30 hover:via-emerald-500/30 hover:to-green-500/30 text-foreground rounded-xl font-medium transition-all duration-300 flex items-center space-x-2 hover:scale-105 border border-teal-500/30"
        >
          <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-card/30 backdrop-blur-xl border border-border/50 rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <CalendarIcon className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Classes</p>
            </div>
          </div>
        </div>

        <div className="bg-card/30 backdrop-blur-xl border border-border/50 rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-400">{stats.present}</p>
              <p className="text-xs text-muted-foreground">Present</p>
            </div>
          </div>
        </div>

        <div className="bg-card/30 backdrop-blur-xl border border-border/50 rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-400">{stats.absent}</p>
              <p className="text-xs text-muted-foreground">Absent</p>
            </div>
          </div>
        </div>

        <div className="bg-card/30 backdrop-blur-xl border border-border/50 rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-400">{stats.upcoming}</p>
              <p className="text-xs text-muted-foreground">Upcoming</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Calendar */}
        <div className="flex-1 bg-card/30 backdrop-blur-xl border border-border/50 rounded-2xl overflow-hidden flex flex-col">
          {/* Calendar Header */}
          <div className="p-4 border-b border-border/50 flex items-center justify-between">
            <button
              onClick={goToPreviousMonth}
              className="p-2 hover:bg-muted/50 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-muted-foreground" />
            </button>

            <div className="flex items-center space-x-4">
              <h2 className="text-xl font-bold text-foreground">
                {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h2>
              <button
                onClick={goToToday}
                className="px-3 py-1 text-sm bg-muted/50 hover:bg-muted/70 rounded-lg transition-colors text-muted-foreground"
              >
                Today
              </button>
            </div>

            <button
              onClick={goToNextMonth}
              className="p-2 hover:bg-muted/50 rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* Days of Week Header */}
          <div className="grid grid-cols-7 border-b border-border/50">
            {DAYS_OF_WEEK.map((day) => (
              <div
                key={day}
                className="p-3 text-center text-sm font-semibold text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="flex-1 overflow-auto">
            <div className="grid grid-cols-7 h-full">
              {calendarDays.map((dayInfo, index) => {
                const dayClasses = dayInfo.dateStr ? (classesByDate[dayInfo.dateStr] || []) : []
                const isToday = dayInfo.dateStr === today
                const isSelected = dayInfo.dateStr === selectedDate

                return (
                  <div
                    key={index}
                    className={cn(
                      "border-b border-r border-border/30 p-2 min-h-[100px] transition-all cursor-pointer",
                      dayInfo.isCurrentMonth ? "bg-transparent hover:bg-muted/30" : "bg-muted/10",
                      isToday && "bg-yellow-500/20",
                      isSelected && "bg-emerald-500/20"
                    )}
                    onClick={() => dayInfo.dateStr && setSelectedDate(dayInfo.dateStr)}
                  >
                    {dayInfo.date && (
                      <>
                        <div className={cn(
                          "text-sm font-medium mb-1",
                          isToday ? "text-yellow-400 font-bold" : dayInfo.isCurrentMonth ? "text-foreground" : "text-muted-foreground"
                        )}>
                          {dayInfo.date.getDate()}
                        </div>
                        
                        {dayClasses.length > 0 && (
                          <div className="space-y-1">
                            {/* Show first 2 classes */}
                            {dayClasses.slice(0, 2).map((cls, i) => (
                              <div
                                key={i}
                                className={cn(
                                  "text-[10px] px-1.5 py-0.5 rounded truncate border",
                                  getStatusBgColor(cls.status)
                                )}
                                title={`${cls.cohort}: ${cls.subjectName || cls.sessionType} - ${cls.mentorName}`}
                              >
                                <span className="font-medium">{cls.cohort}</span>
                                <span className="text-muted-foreground ml-1">{cls.mentorName.split(' ')[0]}</span>
                              </div>
                            ))}
                            
                            {dayClasses.length > 2 && (
                              <div className="text-[10px] text-muted-foreground">
                                +{dayClasses.length - 2} more
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Selected Date Details */}
        <div className="w-80 flex-shrink-0 bg-card/30 backdrop-blur-xl border border-border/50 rounded-2xl overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border/50">
            <h3 className="text-lg font-bold text-foreground">
              {selectedDate 
                ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    month: 'long', 
                    day: 'numeric' 
                  })
                : 'Select a Date'
              }
            </h3>
            <p className="text-sm text-muted-foreground">
              {selectedClasses.length} {selectedClasses.length === 1 ? 'class' : 'classes'}
            </p>
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-3">
            {selectedDate ? (
              selectedClasses.length > 0 ? (
                selectedClasses.map((cls) => (
                  <div
                    key={`${cls.cohortTable}-${cls.id}`}
                    className={cn(
                      "p-4 rounded-xl border transition-all",
                      getStatusBgColor(cls.status)
                    )}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className="font-bold text-foreground">{cls.cohort}</span>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className={cn(
                            "text-xs font-medium px-2 py-0.5 rounded-full",
                            getStatusBgColor(cls.status),
                            getStatusTextColor(cls.status)
                          )}>
                            {cls.status.charAt(0).toUpperCase() + cls.status.slice(1)}
                          </span>
                          {cls.isSwapped && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              Swapped
                            </span>
                          )}
                        </div>
                      </div>
                      <div className={cn("w-3 h-3 rounded-full", getStatusColor(cls.status))} />
                    </div>

                    {/* Session Type */}
                    {cls.sessionType && (
                      <div className="flex items-center space-x-2 mb-2">
                        <div className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full capitalize",
                          cls.sessionType === 'live session' ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" :
                          cls.sessionType === 'contest' ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" :
                          cls.sessionType === 'project' ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" :
                          cls.sessionType === 'assignment' ? "bg-pink-500/20 text-pink-400 border border-pink-500/30" :
                          "bg-gray-500/20 text-gray-400 border border-gray-500/30"
                        )}>
                          {cls.sessionType}
                        </div>
                      </div>
                    )}

                    {/* Subject */}
                    {cls.subjectName && (
                      <div className="flex items-center space-x-2 mb-2">
                        <BookOpen className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-foreground">
                          {cls.subjectName}
                        </span>
                      </div>
                    )}

                    {/* Mentor */}
                    <div className="flex items-center space-x-2 mb-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-foreground">{cls.mentorName}</span>
                      {cls.isSwapped && (
                        <span className="text-xs text-muted-foreground">
                          (orig: {cls.originalMentorName})
                        </span>
                      )}
                    </div>

                    {/* Time */}
                    {cls.time && (
                      <div className="flex items-center space-x-2 mb-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">{cls.time}</span>
                      </div>
                    )}

                    {/* Recording indicator */}
                    {cls.hasRecording && (
                      <div className="flex items-center space-x-2">
                        <Video className="w-4 h-4 text-green-400" />
                        <span className="text-xs text-green-400">Recording available</span>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <CalendarIcon className="w-12 h-12 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No classes on this date</p>
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <CalendarIcon className="w-12 h-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">Click on a date to see class details</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-center space-x-6 text-xs text-muted-foreground">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-green-500 rounded-full" />
          <span>Present</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-red-500 rounded-full" />
          <span>Absent</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full" />
          <span>Upcoming</span>
        </div>
      </div>
    </div>
  )
}
