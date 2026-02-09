'use client'

import { useState, useEffect } from 'react'
import { UserCheck, RefreshCw, Users, Award, AlertTriangle, TrendingUp, Clock, Calendar, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MentorAttendanceData {
  mentor_id: number
  name: string
  email: string | null
  total_classes: number
  present: number
  absent: number
  special_attendance: number
  attendance_percent: number
  updated_at?: string
}

interface MonthlyMentorData {
  mentor_id: number
  name: string
  months: Record<string, { self: number; special: number; missed?: number }>
}

export default function MentorAttendance() {
  const [attendanceData, setAttendanceData] = useState<MentorAttendanceData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCalculating, setIsCalculating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingStep, setLoadingStep] = useState(0)
  
  // Monthly view state
  const [showMonthlyView, setShowMonthlyView] = useState(false)
  const [monthlyData, setMonthlyData] = useState<MonthlyMentorData[]>([])
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [isLoadingMonthly, setIsLoadingMonthly] = useState(false)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  const loadingSteps = [
    'Fetching mentor details...',
    'Scanning cohort schedules...',
    'Counting completed classes...',
    'Calculating attendance...',
    'Saving results...',
    'Almost done...'
  ]

  // Calculate attendance on mount
  useEffect(() => {
    calculateAttendance()
  }, [])

  // Animate loading steps
  useEffect(() => {
    if (isCalculating) {
      const interval = setInterval(() => {
        setLoadingStep(prev => (prev + 1) % loadingSteps.length)
      }, 1500)
      return () => clearInterval(interval)
    }
  }, [isCalculating, loadingSteps.length])

  const calculateAttendance = async () => {
    setIsCalculating(true)
    setIsLoading(true)
    setError(null)
    setLoadingStep(0)

    try {
      // Call POST to calculate attendance
      const response = await fetch('/api/mentor-attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      if (!response.ok) {
        throw new Error('Failed to calculate attendance')
      }

      const result = await response.json()

      if (result.success) {
        // Sort by attendance percentage (high to low)
        const sortedData = result.results.sort((a: MentorAttendanceData, b: MentorAttendanceData) => 
          b.attendance_percent - a.attendance_percent
        )
        setAttendanceData(sortedData)
      } else {
        throw new Error(result.error || 'Failed to calculate attendance')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsCalculating(false)
      setIsLoading(false)
    }
  }

  // Fetch monthly attendance data
  const fetchMonthlyAttendance = async (yearOverride?: number) => {
    const yearToFetch = yearOverride ?? selectedYear
    setIsLoadingMonthly(true)
    setError(null)

    try {
      const response = await fetch(`/api/mentor-attendance?monthly=true&year=${yearToFetch}`)
      const result = await response.json()

      if (result.success) {
        setMonthlyData(result.data)
        setAvailableMonths(result.months)
        setShowMonthlyView(true)
      } else {
        throw new Error(result.error || 'Failed to fetch monthly data')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoadingMonthly(false)
    }
  }

  // Calculate summary stats
  const totalMentors = attendanceData.length
  const avgAttendance = totalMentors > 0 
    ? (attendanceData.reduce((sum, m) => sum + m.attendance_percent, 0) / totalMentors).toFixed(1)
    : 0
  const totalSpecialClasses = attendanceData.reduce((sum, m) => sum + m.special_attendance, 0)
  const lowAttendanceCount = attendanceData.filter(m => m.attendance_percent < 75).length

  if (isLoading || isCalculating) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        {/* Cool Loading Animation */}
        <div className="relative mb-8">
          {/* Outer spinning ring */}
          <div className="w-32 h-32 rounded-full border-4 border-transparent border-t-purple-500 border-r-blue-500 animate-spin" />
          
          {/* Inner spinning ring (opposite direction) */}
          <div className="absolute inset-2 w-28 h-28 rounded-full border-4 border-transparent border-b-cyan-400 border-l-pink-500 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
          
          {/* Center icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/50 animate-pulse">
              <UserCheck className="w-8 h-8 text-white" />
            </div>
          </div>
          
          {/* Floating particles */}
          <div className="absolute -top-2 -right-2 w-4 h-4 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
          <div className="absolute -bottom-2 -left-2 w-3 h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
          <div className="absolute top-1/2 -right-4 w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.6s' }} />
        </div>

        {/* Loading text */}
        <div className="text-center">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent mb-3">
            Calculating Mentor Attendance
          </h2>
          <div className="flex items-center justify-center space-x-2 text-muted-foreground">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-4 h-6 transition-all duration-300">
            {loadingSteps[loadingStep]}
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-64 h-1 bg-muted/30 rounded-full mt-6 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-purple-500 via-blue-500 to-cyan-500 rounded-full animate-pulse"
            style={{ 
              width: `${((loadingStep + 1) / loadingSteps.length) * 100}%`,
              transition: 'width 0.5s ease-out'
            }}
          />
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
          onClick={calculateAttendance}
          className="px-6 py-3 gradient-purple text-white rounded-xl hover:scale-105 transition-all duration-300 font-medium glow-purple flex items-center space-x-2"
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
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/30">
            <UserCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
              Mentor Attendance
            </h1>
            <p className="text-muted-foreground">
              {totalMentors} mentors • Last updated: {attendanceData[0]?.updated_at 
                ? new Date(attendanceData[0].updated_at).toLocaleString() 
                : 'Just now'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => fetchMonthlyAttendance()}
            disabled={isLoadingMonthly}
            className="px-4 py-2 bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-red-500/20 hover:from-amber-500/30 hover:via-orange-500/30 hover:to-red-500/30 text-foreground rounded-xl font-medium transition-all duration-300 flex items-center space-x-2 hover:scale-105 border border-amber-500/30"
          >
            <Calendar className={cn("w-4 h-4", isLoadingMonthly && "animate-spin")} />
            <span>Check Monthly Attendance</span>
          </button>
          
          <button
            onClick={calculateAttendance}
            disabled={isCalculating}
            className="px-4 py-2 bg-gradient-to-r from-purple-500/20 via-blue-500/20 to-cyan-500/20 hover:from-purple-500/30 hover:via-blue-500/30 hover:to-cyan-500/30 text-foreground rounded-xl font-medium transition-all duration-300 flex items-center space-x-2 hover:scale-105 border border-purple-500/30"
          >
            <RefreshCw className={cn("w-4 h-4", isCalculating && "animate-spin")} />
            <span>Recalculate</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-card/30 backdrop-blur-xl border border-border/50 rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{totalMentors}</p>
              <p className="text-xs text-muted-foreground">Total Mentors</p>
            </div>
          </div>
        </div>

        <div className="bg-card/30 backdrop-blur-xl border border-border/50 rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{avgAttendance}%</p>
              <p className="text-xs text-muted-foreground">Avg Attendance</p>
            </div>
          </div>
        </div>

        <div className="bg-card/30 backdrop-blur-xl border border-border/50 rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-cyan-500/20 rounded-lg flex items-center justify-center">
              <Award className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{totalSpecialClasses}</p>
              <p className="text-xs text-muted-foreground">Special Classes</p>
            </div>
          </div>
        </div>

        <div className="bg-card/30 backdrop-blur-xl border border-border/50 rounded-xl p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{lowAttendanceCount}</p>
              <p className="text-xs text-muted-foreground">Below 75%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden">
        <div className="bg-card/30 backdrop-blur-xl border border-border/50 rounded-2xl overflow-hidden h-full">
          <div className="overflow-auto h-full">
            {attendanceData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <UserCheck className="w-16 h-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">No Attendance Data</h3>
                <p className="text-muted-foreground">
                  No completed classes found to calculate attendance.
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-muted/30 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground whitespace-nowrap">Mentor ID</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground whitespace-nowrap">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground whitespace-nowrap">Email</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground whitespace-nowrap">Total Classes</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground whitespace-nowrap">Present</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground whitespace-nowrap">Absent</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground whitespace-nowrap">
                      <div className="flex items-center space-x-1">
                        <Award className="w-4 h-4 text-cyan-400" />
                        <span>Special</span>
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-foreground whitespace-nowrap">Attendance %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {attendanceData.map((mentor) => (
                    <tr key={mentor.mentor_id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-purple-400 font-mono font-semibold">
                        {mentor.mentor_id}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground font-medium">
                        {mentor.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {mentor.email || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {mentor.total_classes}
                      </td>
                      <td className="px-4 py-3 text-sm text-green-400">
                        {mentor.present}
                      </td>
                      <td className="px-4 py-3 text-sm text-red-400">
                        {mentor.absent}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {mentor.special_attendance > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                            +{mentor.special_attendance}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center space-x-2">
                          <div className="w-20 h-2 bg-muted/30 rounded-full overflow-hidden">
                            <div 
                              className={cn(
                                "h-full rounded-full transition-all duration-500",
                                mentor.attendance_percent >= 90 ? "bg-green-500" :
                                mentor.attendance_percent >= 75 ? "bg-blue-500" :
                                mentor.attendance_percent >= 50 ? "bg-yellow-500" :
                                "bg-red-500"
                              )}
                              style={{ width: `${Math.min(mentor.attendance_percent, 100)}%` }}
                            />
                          </div>
                          <span
                            className={cn(
                              "font-semibold min-w-[3rem]",
                              mentor.attendance_percent >= 90 ? 'text-green-400' :
                              mentor.attendance_percent >= 75 ? 'text-blue-400' :
                              mentor.attendance_percent >= 50 ? 'text-yellow-400' :
                              'text-red-400'
                            )}
                          >
                            {mentor.attendance_percent.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-center space-x-6 text-xs text-muted-foreground">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-green-500 rounded-full" />
          <span>≥90% Excellent</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-blue-500 rounded-full" />
          <span>≥75% Good</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-yellow-500 rounded-full" />
          <span>≥50% Needs Improvement</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-red-500 rounded-full" />
          <span>&lt;50% Critical</span>
        </div>
      </div>

      {/* Monthly View Modal */}
      {showMonthlyView && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border/50 rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setShowMonthlyView(false)}
                  className="p-2 hover:bg-muted/50 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                </button>
                <div>
                  <h2 className="text-2xl font-bold bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 bg-clip-text text-transparent">
                    Monthly Attendance - {selectedYear}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {monthlyData.length} mentors • {availableMonths.length} months with data
                  </p>
                </div>
              </div>
              
              {/* Legend */}
              <div className="flex items-center space-x-4 text-sm">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <span className="text-muted-foreground">Self Classes</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-cyan-400" />
                  <span className="text-muted-foreground">Special Classes</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <span className="text-muted-foreground">Missed Classes</span>
                </div>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-auto p-6">
              {isLoadingMonthly ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin mx-auto" />
                    <p className="text-muted-foreground">Loading monthly data...</p>
                  </div>
                </div>
              ) : monthlyData.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center space-y-4">
                    <Calendar className="w-16 h-16 text-muted-foreground mx-auto" />
                    <p className="text-muted-foreground">No attendance data found for {selectedYear}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  {monthlyData.map((mentor) => (
                    <div key={mentor.mentor_id} className="bg-muted/20 rounded-xl border border-border/30 overflow-hidden">
                      {/* Mentor Header */}
                      <div className="px-4 py-3 bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-cyan-500/10 border-b border-border/30">
                        <h3 className="font-bold text-lg text-foreground flex items-center space-x-2">
                          <span className="text-purple-400 font-mono">#{mentor.mentor_id}</span>
                          <span>{mentor.name}</span>
                        </h3>
                      </div>
                      
                      {/* Monthly Table */}
                      <div className="p-4 overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr>
                              {availableMonths.map((month) => (
                                <th key={month} className="px-4 py-2 text-center text-sm font-semibold text-muted-foreground whitespace-nowrap">
                                  {month}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              {availableMonths.map((month) => {
                                const monthData = mentor.months[month]
                                const selfCount = monthData?.self || 0
                                const specialCount = monthData?.special || 0
                                const missedCount = monthData?.missed || 0
                                const hasData = selfCount > 0 || specialCount > 0 || missedCount > 0

                                return (
                                  <td key={month} className="px-4 py-3 text-center">
                                    {hasData ? (
                                      <div className="flex items-center justify-center space-x-1">
                                        <span className="text-green-400 font-bold text-lg">{selfCount}</span>
                                        {specialCount > 0 && (
                                          <>
                                            <span className="text-muted-foreground">+</span>
                                            <span className="text-cyan-400 font-bold text-lg">{specialCount}</span>
                                          </>
                                        )}
                                        {missedCount > 0 && (
                                          <>
                                            <span className="text-muted-foreground">/</span>
                                            <span className="text-red-400 font-bold text-lg">{missedCount}</span>
                                          </>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-muted-foreground/50">-</span>
                                    )}
                                  </td>
                                )
                              })}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border/50 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                <span>Year:</span>
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    const newYear = parseInt(e.target.value)
                    setSelectedYear(newYear)
                    // Re-fetch with the new year directly
                    fetchMonthlyAttendance(newYear)
                  }}
                  className="px-3 py-1 bg-muted/50 border border-border/50 rounded-lg text-foreground focus:outline-none"
                >
                  {[2024, 2025, 2026, 2027].map((yr) => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>
              </div>
              
              <button
                onClick={() => setShowMonthlyView(false)}
                className="px-6 py-2 bg-muted hover:bg-muted/80 text-foreground rounded-xl font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

