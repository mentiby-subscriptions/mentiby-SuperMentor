'use client'

import { useState, useEffect } from 'react'
import { Search, Filter, Download, Plus, Trash2, X, HelpCircle, Phone, Copy } from 'lucide-react'
import { OnboardingData, FilterOptions } from '@/types'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

interface DataTableProps {
  data: OnboardingData[]
  isLoading: boolean
  onDataUpdate: () => void
}

interface EditingCell {
  rowId: string
  field: keyof OnboardingData
  value: string
  originalValue: string
}

export default function DataTable({ data, isLoading, onDataUpdate }: DataTableProps) {
  const [filteredData, setFilteredData] = useState<OnboardingData[]>([])
  const [filters, setFilters] = useState<FilterOptions>({
    cohortType: '',
    cohortNumber: ''
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [showAddForm, setShowAddForm] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [showDeleteMode, setShowDeleteMode] = useState(false)
  const [showPhoneCopyMode, setShowPhoneCopyMode] = useState(false)
  const [toastNotification, setToastNotification] = useState<{
    show: boolean
    message: string
    type: 'success' | 'error'
  }>({ show: false, message: '', type: 'success' })
  const [newRowData, setNewRowData] = useState<Partial<OnboardingData>>({})
  const [goalPopup, setGoalPopup] = useState<{ isOpen: boolean; content: string; studentName: string }>({
    isOpen: false,
    content: '',
    studentName: ''
  })

  const cohortTypes = ['Basic', 'Placement', 'MERN', 'Full Stack']

  // Toast notification function
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToastNotification({ show: true, message, type })
    setTimeout(() => {
      setToastNotification({ show: false, message: '', type: 'success' })
    }, 2000)
  }

  // Run debug on component mount
  useEffect(() => {
    if (data.length > 0) {
      // Debug function to check database structure (moved inside useEffect)
      const debugDatabaseStructure = async () => {
        try {
          console.log('=== DATABASE DEBUG INFO ===')

          // Get the last record based on EnrollmentID (highest year then highest number)
          const { data: sampleData, error: sampleError } = await supabase
            .from('onboarding')
            .select('*')
            .order('EnrollmentID', { ascending: false })
            .limit(1)

          if (sampleError) {
            console.error('Error fetching sample data:', sampleError)
            return
          }

          if (sampleData && sampleData.length > 0) {
            console.log('Latest record from database (by EnrollmentID):', sampleData[0])
            console.log('Available columns:', Object.keys(sampleData[0]))
          }

          // Test if we can find a specific record
          if (data.length > 0) {
            const testId = data[0].EnrollmentID
            console.log('Testing lookup for EnrollmentID:', testId)

            const { data: testData, error: testError } = await supabase
              .from('onboarding')
              .select('*')
              .eq('EnrollmentID', testId)

            if (testError) {
              console.error('Error in test lookup:', testError)
            } else {
              console.log('Test lookup result:', testData)
            }
          }
        } catch (error) {
          console.error('Debug function error:', error)
        }
      }

      debugDatabaseStructure()
    }
  }, [data])

  // Custom sorting function for enrollment IDs
  const sortByEnrollmentId = (a: OnboardingData, b: OnboardingData) => {
    const aId = a.EnrollmentID
    const bId = b.EnrollmentID

    // Extract year and number parts
    const aMatch = aId.match(/(\d{2})MBY(\d+)/)
    const bMatch = bId.match(/(\d{2})MBY(\d+)/)

    if (!aMatch || !bMatch) return aId.localeCompare(bId)

    const aYear = parseInt(aMatch[1])
    const bYear = parseInt(bMatch[1])
    const aNumber = parseInt(aMatch[2])
    const bNumber = parseInt(bMatch[2])

    // Sort by year first, then by number
    if (aYear !== bYear) return aYear - bYear
    return aNumber - bNumber
  }

  useEffect(() => {
    let filtered = [...data]

    // Sort by enrollment ID first
    filtered.sort(sortByEnrollmentId)

    // Apply cohort type filter
    if (filters.cohortType) {
      filtered = filtered.filter(item => item['Cohort Type'] === filters.cohortType)
    }

    // Apply cohort number filter
    if (filters.cohortNumber) {
      filtered = filtered.filter(item =>
        item['Cohort Number'].includes(filters.cohortNumber)
      )
    }

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(item =>
        Object.values(item).some(value =>
          String(value).toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    }

    setFilteredData(filtered)
  }, [data, filters, searchTerm])

  const handleCellDoubleClick = (rowId: string, field: keyof OnboardingData, value: any) => {
    setEditingCell({
      rowId,
      field,
      value: String(value || ''),
      originalValue: String(value || '')
    })
  }

  const handleSaveEdit = async () => {
    if (!editingCell || isSaving) return

    try {
      setIsSaving(true)

      // Prepare the update data
      let updateValue: any = editingCell.value

      // Handle different field types
      if (editingCell.field === 'Graduation Year') {
        updateValue = editingCell.value ? parseInt(editingCell.value) : null
      }

      console.log('=== UPDATE ATTEMPT ===')
      console.log('EnrollmentID:', editingCell.rowId)
      console.log('Field:', editingCell.field)
      console.log('New Value:', updateValue)
      console.log('Original Value:', editingCell.originalValue)
      console.log('Value type:', typeof updateValue)

      // Check current user/session info for debugging
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      console.log('Current user:', user, 'User error:', userError)

      // First, let's verify the record exists
      const { data: existingRecord, error: lookupError } = await supabase
        .from('onboarding')
        .select('*')
        .eq('EnrollmentID', editingCell.rowId)

      if (lookupError) {
        console.error('Lookup error:', lookupError)
        throw new Error(`Failed to find record: ${lookupError.message}`)
      }

      if (!existingRecord || existingRecord.length === 0) {
        console.error('No record found with EnrollmentID:', editingCell.rowId)
        throw new Error(`Record with EnrollmentID ${editingCell.rowId} not found in database`)
      }

      console.log('Found existing record:', existingRecord[0])

      // Try the update with different approaches to handle potential permissions issues
      console.log('Attempting update with .select()...')
      const { data: updatedData, error, count } = await supabase
        .from('onboarding')
        .update({ [editingCell.field]: updateValue })
        .eq('EnrollmentID', editingCell.rowId)
        .select()

      console.log('Update response:', { data: updatedData, error, count })

      if (error) {
        console.error('Supabase update error:', error)
        throw new Error(`Update failed: ${error.message}`)
      }

      // If no data returned but no error, try verifying the update worked
      if (!updatedData || updatedData.length === 0) {
        console.warn('No data returned from update, verifying update success...')

        // Check if the update actually worked by fetching the record again
        const { data: verifyData, error: verifyError } = await supabase
          .from('onboarding')
          .select('*')
          .eq('EnrollmentID', editingCell.rowId)
          .single()

        if (verifyError) {
          console.error('Verification fetch error:', verifyError)
          throw new Error(`Update verification failed: ${verifyError.message}`)
        }

        if (verifyData && verifyData[editingCell.field] === updateValue) {
          console.log('✅ Update verified successful even without returned data')
          // Update was successful, continue with success flow
        } else {
          console.error('Update verification failed - value not updated')
          console.log('Expected:', updateValue, 'Got:', verifyData?.[editingCell.field])

          // Try alternative approach: upsert with the existing record data
          console.log('Attempting alternative upsert approach...')
          const updatedRecord = { ...verifyData, [editingCell.field]: updateValue }

          const { data: upsertData, error: upsertError } = await supabase
            .from('onboarding')
            .upsert(updatedRecord, {
              onConflict: 'EnrollmentID',
              ignoreDuplicates: false
            })
            .select()

          if (upsertError) {
            console.error('Upsert error:', upsertError)
            throw new Error(`All update methods failed. Final error: ${upsertError.message}`)
          }

          if (upsertData && upsertData.length > 0) {
            console.log('✅ Upsert successful:', upsertData[0])
          } else {
            throw new Error('Update operation failed completely. This indicates a permissions or configuration issue.')
          }
        }
      }

      console.log('✅ Update successful:', updatedData[0])

      // Success - refresh data and clear editing state
      setEditingCell(null)
      onDataUpdate()

    } catch (error) {
      console.error('❌ Update failed:', error)
      // Reset to original value on error
      if (editingCell) {
        setEditingCell(prev => prev ? { ...prev, value: prev.originalValue } : null)
      }
      alert(`Failed to update data: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingCell(null)
  }

  const handleGoalClick = (content: string, studentName: string) => {
    setGoalPopup({
      isOpen: true,
      content: content || 'No goal specified',
      studentName: studentName
    })
  }

  const closeGoalPopup = () => {
    setGoalPopup({
      isOpen: false,
      content: '',
      studentName: ''
    })
  }

  // Generate next enrollment ID
  const generateNextEnrollmentId = () => {
    if (data.length === 0) return '25MBY3001'

    // Find the highest enrollment ID
    const currentYear = new Date().getFullYear().toString().slice(-2)
    const currentYearIds = data
      .map(item => item.EnrollmentID)
      .filter(id => id.startsWith(`${currentYear}MBY`))
      .map(id => {
        const match = id.match(/(\d{2})MBY(\d+)/)
        return match ? parseInt(match[2]) : 0
      })
      .sort((a, b) => b - a)

    const nextNumber = currentYearIds.length > 0 ? currentYearIds[0] + 1 : 3001
    return `${currentYear}MBY${nextNumber}`
  }

  const handleAddRow = async () => {
    try {
      setIsSaving(true)

      // Generate enrollment ID if not provided
      const enrollmentId = newRowData.EnrollmentID || generateNextEnrollmentId()

      // Prepare the new record with required fields
      const newRecord: OnboardingData = {
        EnrollmentID: enrollmentId,
        'Full Name': newRowData['Full Name'] || '',
        Email: newRowData.Email || '',
        'Phone Number': newRowData['Phone Number'] || '',
        LinkedIn: newRowData.LinkedIn || '',
        GitHub: newRowData.GitHub || '',
        Hackerrank: newRowData.Hackerrank || '',
        College: newRowData.College || '',
        'College State': newRowData['College State'] || '',
        'College Year': newRowData['College Year'] || '',
        Branch: newRowData.Branch || '',
        'Graduation Year': newRowData['Graduation Year'] || 0,
        Understanding: newRowData.Understanding || '',
        'Familiar Skills': newRowData['Familiar Skills'] || '',
        'Built Projects': newRowData['Built Projects'] || '',
        Goal: newRowData.Goal || '',
        'Cohort Type': newRowData['Cohort Type'] || 'Basic',
        'Cohort Number': newRowData['Cohort Number'] || ''
      }

      console.log('Adding new record:', newRecord)

      const { data: insertedData, error } = await supabase
        .from('onboarding')
        .insert([newRecord])
        .select()

      if (error) {
        console.error('Insert error:', error)
        throw new Error(`Failed to add record: ${error.message}`)
      }

      console.log('✅ Record added successfully:', insertedData)

      // Reset form and refresh data
      setNewRowData({})
      setShowAddForm(false)
      onDataUpdate()

    } catch (error) {
      console.error('❌ Add failed:', error)
      alert(`Failed to add record: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteRows = async () => {
    if (selectedRows.size === 0) return

    const confirmed = confirm(`Are you sure you want to delete ${selectedRows.size} record(s)? This action cannot be undone.`)
    if (!confirmed) return

    try {
      setIsSaving(true)

      const idsToDelete = Array.from(selectedRows)
      console.log('Deleting records with IDs:', idsToDelete)

      const { error } = await supabase
        .from('onboarding')
        .delete()
        .in('EnrollmentID', idsToDelete)

      if (error) {
        console.error('Delete error:', error)
        throw new Error(`Failed to delete records: ${error.message}`)
      }

      console.log('✅ Records deleted successfully')

      // Clear selection and refresh data
      setSelectedRows(new Set())
      setShowDeleteMode(false)
      onDataUpdate()

    } catch (error) {
      console.error('❌ Delete failed:', error)
      alert(`Failed to delete records: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCopyPhoneNumbers = async () => {
    if (selectedRows.size === 0) return

    try {
      // Get selected rows data
      const selectedData = filteredData.filter(row => selectedRows.has(row.EnrollmentID))
      
      // Extract phone numbers (filter out empty/invalid ones)
      const phoneNumbers = selectedData
        .map(row => row['Phone Number'])
        .filter(phone => phone && phone.trim() !== '' && phone !== '-' && !phone.includes('undefined'))
      
      if (phoneNumbers.length === 0) {
        showToast('No valid phone numbers found in selected rows!', 'error')
        return
      }

      // Join with newlines
      const phoneText = phoneNumbers.join('\n')
      
      // Copy to clipboard
      await navigator.clipboard.writeText(phoneText)
      
      // Clear selection and hide checkboxes
      setSelectedRows(new Set())
      setShowPhoneCopyMode(false)
      
      // Show success message
      showToast(`📋 Copied ${phoneNumbers.length} phone numbers to clipboard!`)
      
    } catch (error) {
      console.error('❌ Copy failed:', error)
      showToast(`Failed to copy phone numbers: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
    }
  }

  const handleRowSelect = (enrollmentId: string, isSelected: boolean) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev)
      if (isSelected) {
        newSet.add(enrollmentId)
      } else {
        newSet.delete(enrollmentId)
      }
      return newSet
    })
  }

  const handleSelectAll = (isSelected: boolean) => {
    if (isSelected) {
      setSelectedRows(new Set(filteredData.map(row => row.EnrollmentID)))
    } else {
      setSelectedRows(new Set())
    }
  }

  const exportData = () => {
    const headers = Object.keys(data[0] || {})
    const csv = [
      headers.join(','),
      ...filteredData.map(row =>
        headers.map(header => `"${String(row[header as keyof OnboardingData]).replace(/"/g, '""')}"`).join(',')
      )
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'onboarding-data.csv'
    link.click()
  }

  const renderCell = (row: OnboardingData, field: keyof OnboardingData, value: any) => {
    const isEditing = editingCell?.rowId === row.EnrollmentID && editingCell?.field === field

    if (isEditing) {
      return (
        <div className="editing-cell">
          <input
            type={field === 'Graduation Year' ? 'number' : 'text'}
            value={editingCell.value}
            onChange={(e) => setEditingCell(prev => prev ? { ...prev, value: e.target.value } : null)}
            className="w-full bg-transparent border-none outline-none text-foreground"
            autoFocus
            disabled={isSaving}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSaveEdit()
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                handleCancelEdit()
              }
            }}
            onBlur={handleSaveEdit}
          />
          {isSaving && (
            <div className="absolute inset-0 bg-primary/20 rounded flex items-center justify-center">
              <div className="w-4 h-4 animate-spin border-2 border-primary border-t-transparent rounded-full" />
            </div>
          )}
        </div>
      )
    }

    // Special rendering for different field types
    if (field === 'Cohort Type') {
      return (
        <span className={cn(
          "px-3 py-1 rounded-full text-xs font-medium",
          value === 'Basic' && "bg-blue-500/20 text-blue-400 border border-blue-500/30",
          value === 'Placement' && "bg-green-500/20 text-green-400 border border-green-500/30",
          value === 'MERN' && "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
          value === 'Full Stack' && "bg-purple-500/20 text-purple-400 border border-purple-500/30"
        )}>
          {value}
        </span>
      )
    }

    if (field === 'LinkedIn' || field === 'GitHub' || field === 'Hackerrank') {
      const isValidUrl = value && value !== '-' && value.trim() !== '' && !value.includes('undefined')
      return isValidUrl ? (
        <a
          href={value.startsWith('http') ? value : `https://${value}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 underline truncate max-w-[150px] block"
        >
          {value}
        </a>
      ) : (
        <span className="text-muted-foreground">-</span>
      )
    }

    if (field === 'Email') {
      const isValidEmail = value && value !== '-' && value.trim() !== '' && value.includes('@') && !value.includes('undefined')
      return isValidEmail ? (
        <a
          href={`mailto:${value}`}
          className="text-blue-400 hover:text-blue-300 underline"
        >
          {value}
        </a>
      ) : (
        <span className="text-muted-foreground">-</span>
      )
    }

    return <span className="truncate">{value || '-'}</span>
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 pt-2 sm:pt-0">
        <div>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold gradient-text">Onboarding Data</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Showing {filteredData.length} of {data.length} students
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "px-3 py-2 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 flex items-center space-x-1 sm:space-x-2",
              showFilters
                ? "gradient-purple text-white shadow-lg glow-purple"
                : "bg-muted/50 hover:bg-muted/70 text-muted-foreground hover:text-foreground"
            )}
          >
            <Filter className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Filters</span>
          </button>
          <button
            onClick={() => setShowGuide(true)}
            className="px-3 py-2 sm:px-4 sm:py-2 bg-muted/50 hover:bg-muted/70 text-muted-foreground hover:text-foreground rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 flex items-center space-x-1 sm:space-x-2"
          >
            <HelpCircle className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Guide</span>
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-3 py-2 sm:px-4 sm:py-2 gradient-green text-white rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 flex items-center space-x-1 sm:space-x-2 hover:scale-105 glow-green"
          >
            <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Add</span>
          </button>
          <button
            onClick={() => {
              setShowPhoneCopyMode(!showPhoneCopyMode)
              setShowDeleteMode(false) // Hide delete mode when phone copy is active
              if (!showPhoneCopyMode) {
                setSelectedRows(new Set())
              }
            }}
            className={cn(
              "px-3 py-2 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 flex items-center space-x-1 sm:space-x-2",
              showPhoneCopyMode
                ? "bg-gradient-to-r from-purple-600 via-blue-600 to-purple-700 text-white shadow-lg shadow-purple-500/50 hover:shadow-purple-500/70 animate-pulse"
                : "bg-gradient-to-r from-purple-500/20 via-blue-500/20 to-purple-600/20 hover:from-purple-500/30 hover:via-blue-500/30 hover:to-purple-600/30 text-purple-300 hover:text-purple-100 border border-purple-500/30 hover:border-purple-400/50"
            )}
          >
            <Phone className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Copy Phone</span>
          </button>
          <button
            onClick={() => {
              setShowDeleteMode(!showDeleteMode)
              setShowPhoneCopyMode(false) // Hide phone copy mode when delete is active
              if (!showDeleteMode) {
                setSelectedRows(new Set())
              }
            }}
            className={cn(
              "px-3 py-2 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 flex items-center space-x-1 sm:space-x-2",
              showDeleteMode
                ? "gradient-red text-white glow-red"
                : "bg-muted/50 hover:bg-muted/70 text-muted-foreground hover:text-foreground"
            )}
          >
            <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Delete</span>
          </button>
          {showPhoneCopyMode && selectedRows.size > 0 && (
            <button
              onClick={handleCopyPhoneNumbers}
              disabled={isSaving}
              className="px-3 py-2 sm:px-4 sm:py-2 bg-gradient-to-r from-purple-600 via-blue-600 to-purple-700 text-white rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 flex items-center space-x-1 sm:space-x-2 hover:scale-105 shadow-lg shadow-purple-500/50 hover:shadow-purple-500/70 disabled:opacity-50"
            >
              <Copy className="w-3 h-3 sm:w-4 sm:h-4" />
              <span>Copy ({selectedRows.size})</span>
            </button>
          )}
          {showDeleteMode && selectedRows.size > 0 && (
            <button
              onClick={handleDeleteRows}
              disabled={isSaving}
              className="px-3 py-2 sm:px-4 sm:py-2 gradient-red text-white rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 flex items-center space-x-1 sm:space-x-2 hover:scale-105 glow-red disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
              <span>({selectedRows.size})</span>
            </button>
          )}
          <button
            onClick={exportData}
            className="px-3 py-2 sm:px-4 sm:py-2 gradient-blue text-white rounded-lg text-xs sm:text-sm font-medium transition-all duration-300 flex items-center space-x-1 sm:space-x-2 hover:scale-105 glow-blue"
          >
            <Download className="w-3 h-3 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Add Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-card/90 backdrop-blur-xl border border-border/50 rounded-xl sm:rounded-2xl p-4 sm:p-8 max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <h3 className="text-xl sm:text-2xl font-bold gradient-text">Add New Student</h3>
              <button
                onClick={() => setShowAddForm(false)}
                className="p-2 hover:bg-muted/50 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Enrollment ID</label>
                <input
                  type="text"
                  value={newRowData.EnrollmentID || ''}
                  onChange={(e) => setNewRowData(prev => ({ ...prev, EnrollmentID: e.target.value }))}
                  placeholder={generateNextEnrollmentId()}
                  className="w-full px-4 py-3 bg-input/50 backdrop-blur-sm border border-border/50 rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Full Name *</label>
                <input
                  type="text"
                  value={newRowData['Full Name'] || ''}
                  onChange={(e) => setNewRowData(prev => ({ ...prev, 'Full Name': e.target.value }))}
                  className="w-full px-4 py-3 bg-input/50 backdrop-blur-sm border border-border/50 rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Email *</label>
                <input
                  type="email"
                  value={newRowData.Email || ''}
                  onChange={(e) => setNewRowData(prev => ({ ...prev, Email: e.target.value }))}
                  className="w-full px-4 py-3 bg-input/50 backdrop-blur-sm border border-border/50 rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Phone Number</label>
                <input
                  type="text"
                  value={newRowData['Phone Number'] || ''}
                  onChange={(e) => setNewRowData(prev => ({ ...prev, 'Phone Number': e.target.value }))}
                  className="w-full px-4 py-3 bg-input/50 backdrop-blur-sm border border-border/50 rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">LinkedIn</label>
                <input
                  type="text"
                  value={newRowData.LinkedIn || ''}
                  onChange={(e) => setNewRowData(prev => ({ ...prev, LinkedIn: e.target.value }))}
                  className="w-full px-4 py-3 bg-input/50 backdrop-blur-sm border border-border/50 rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">GitHub</label>
                <input
                  type="text"
                  value={newRowData.GitHub || ''}
                  onChange={(e) => setNewRowData(prev => ({ ...prev, GitHub: e.target.value }))}
                  className="w-full px-4 py-3 bg-input/50 backdrop-blur-sm border border-border/50 rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Hackerrank</label>
                <input
                  type="text"
                  value={newRowData.Hackerrank || ''}
                  onChange={(e) => setNewRowData(prev => ({ ...prev, Hackerrank: e.target.value }))}
                  className="w-full px-4 py-3 bg-input/50 backdrop-blur-sm border border-border/50 rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">College</label>
                <input
                  type="text"
                  value={newRowData.College || ''}
                  onChange={(e) => setNewRowData(prev => ({ ...prev, College: e.target.value }))}
                  className="w-full px-4 py-3 bg-input/50 backdrop-blur-sm border border-border/50 rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">College State</label>
                <input
                  type="text"
                  value={newRowData['College State'] || ''}
                  onChange={(e) => setNewRowData(prev => ({ ...prev, 'College State': e.target.value }))}
                  className="w-full px-4 py-3 bg-input/50 backdrop-blur-sm border border-border/50 rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">College Year</label>
                <input
                  type="text"
                  value={newRowData['College Year'] || ''}
                  onChange={(e) => setNewRowData(prev => ({ ...prev, 'College Year': e.target.value }))}
                  className="w-full px-4 py-3 bg-input/50 backdrop-blur-sm border border-border/50 rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Branch</label>
                <input
                  type="text"
                  value={newRowData.Branch || ''}
                  onChange={(e) => setNewRowData(prev => ({ ...prev, Branch: e.target.value }))}
                  className="w-full px-4 py-3 bg-input/50 backdrop-blur-sm border border-border/50 rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Graduation Year</label>
                <input
                  type="number"
                  value={newRowData['Graduation Year'] || ''}
                  onChange={(e) => setNewRowData(prev => ({ ...prev, 'Graduation Year': parseInt(e.target.value) || 0 }))}
                  className="w-full px-4 py-3 bg-input/50 backdrop-blur-sm border border-border/50 rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Cohort Type</label>
                <select
                  value={newRowData['Cohort Type'] || 'Basic'}
                  onChange={(e) => setNewRowData(prev => ({ ...prev, 'Cohort Type': e.target.value as OnboardingData['Cohort Type'] }))}
                  className="w-full px-4 py-3 bg-input/50 backdrop-blur-sm border border-border/50 rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  {cohortTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Cohort Number</label>
                <input
                  type="text"
                  value={newRowData['Cohort Number'] || ''}
                  onChange={(e) => setNewRowData(prev => ({ ...prev, 'Cohort Number': e.target.value }))}
                  className="w-full px-4 py-3 bg-input/50 backdrop-blur-sm border border-border/50 rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div className="md:col-span-2 lg:col-span-3">
                <label className="block text-sm font-medium text-foreground mb-2">Understanding</label>
                <textarea
                  value={newRowData.Understanding || ''}
                  onChange={(e) => setNewRowData(prev => ({ ...prev, Understanding: e.target.value }))}
                  rows={3}
                  className="w-full px-4 py-3 bg-input/50 backdrop-blur-sm border border-border/50 rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                />
              </div>

              <div className="md:col-span-2 lg:col-span-3">
                <label className="block text-sm font-medium text-foreground mb-2">Familiar Skills</label>
                <textarea
                  value={newRowData['Familiar Skills'] || ''}
                  onChange={(e) => setNewRowData(prev => ({ ...prev, 'Familiar Skills': e.target.value }))}
                  rows={3}
                  className="w-full px-4 py-3 bg-input/50 backdrop-blur-sm border border-border/50 rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                />
              </div>

              <div className="md:col-span-2 lg:col-span-3">
                <label className="block text-sm font-medium text-foreground mb-2">Built Projects</label>
                <textarea
                  value={newRowData['Built Projects'] || ''}
                  onChange={(e) => setNewRowData(prev => ({ ...prev, 'Built Projects': e.target.value }))}
                  rows={3}
                  className="w-full px-4 py-3 bg-input/50 backdrop-blur-sm border border-border/50 rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                />
              </div>

              <div className="md:col-span-2 lg:col-span-3">
                <label className="block text-sm font-medium text-foreground mb-2">Goal</label>
                <textarea
                  value={newRowData.Goal || ''}
                  onChange={(e) => setNewRowData(prev => ({ ...prev, Goal: e.target.value }))}
                  rows={3}
                  className="w-full px-4 py-3 bg-input/50 backdrop-blur-sm border border-border/50 rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-4 mt-6 sm:mt-8">
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 sm:px-6 sm:py-3 bg-muted/50 hover:bg-muted/70 text-muted-foreground hover:text-foreground rounded-xl font-medium transition-all duration-300 text-sm sm:text-base"
              >
                Cancel
              </button>
              <button
                onClick={handleAddRow}
                disabled={isSaving}
                className="px-4 py-2 sm:px-6 sm:py-3 gradient-green text-white rounded-xl font-medium transition-all duration-300 flex items-center justify-center space-x-2 hover:scale-105 glow-green disabled:opacity-50 text-sm sm:text-base"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 animate-spin border-2 border-white border-t-transparent rounded-full" />
                    <span>Adding...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Add Student</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guide Modal */}
      {showGuide && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-card/90 backdrop-blur-xl border border-border/50 rounded-xl sm:rounded-2xl p-4 sm:p-8 max-w-3xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <h3 className="text-xl sm:text-2xl font-bold text-cyan-400">Admin Panel Usage Guide</h3>
              <button
                onClick={() => setShowGuide(false)}
                className="p-2 hover:bg-muted/50 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6 text-foreground">
              {/* Admin Panel Overview */}
              <div>
                <p className="text-sm text-muted-foreground mb-3">
                  Welcome to the MentiBY Admin Panel! This comprehensive dashboard provides all the tools you need to manage students, track progress, and analyze data.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="bg-muted/20 rounded-lg p-3">
                    <div className="font-medium text-blue-400 mb-1">📊 Onboarding Data</div>
                    <div className="text-muted-foreground text-xs">View and manage student enrollment records</div>
                  </div>
                  <div className="bg-muted/20 rounded-lg p-3">
                    <div className="font-medium text-orange-400 mb-1">💬 MentiBY Feedback</div>
                    <div className="text-muted-foreground text-xs">Student feedback and ratings analysis</div>
                  </div>
                  <div className="bg-muted/20 rounded-lg p-3">
                    <div className="font-medium text-yellow-400 mb-1">🏆 XP Leaderboard</div>
                    <div className="text-muted-foreground text-xs">Student experience points rankings</div>
                  </div>
                  <div className="bg-muted/20 rounded-lg p-3">
                    <div className="font-medium text-blue-400 mb-1">📋 Attendance Records</div>
                    <div className="text-muted-foreground text-xs">View attendance statistics by cohort</div>
                  </div>
                  <div className="bg-muted/20 rounded-lg p-3">
                    <div className="font-medium text-orange-400 mb-1">📞 Calling Agent</div>
                    <div className="text-muted-foreground text-xs">Automated calling and communication</div>
                  </div>
                  <div className="bg-muted/20 rounded-lg p-3">
                    <div className="font-medium text-green-400 mb-1">📤 Attendance Upload</div>
                    <div className="text-muted-foreground text-xs">Upload attendance CSV files</div>
                  </div>
                  <div className="bg-muted/20 rounded-lg p-3">
                    <div className="font-medium text-purple-400 mb-1">📈 Cohort Charts</div>
                    <div className="text-muted-foreground text-xs">Visual analytics and distribution graphs</div>
                  </div>
                </div>
              </div>

              {/* Onboarding Data Management */}
              <div>
                <h4 className="text-lg font-semibold text-blue-400 mb-3">📊 Onboarding Data Management</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• <strong className="text-foreground">View Records:</strong> Browse all student enrollment and onboarding data</li>
                  <li>• <strong className="text-foreground">Edit Inline:</strong> Double-click any cell to edit values directly</li>
                  <li>• <strong className="text-foreground">Add Students:</strong> Use &quot;Add Row&quot; button to create new student records</li>
                  <li>• <strong className="text-foreground">Bulk Delete:</strong> Select multiple records and delete them together</li>
                  <li>• <strong className="text-foreground">Phone Copy:</strong> Copy phone numbers in bulk for communication</li>
                  <li>• <strong className="text-foreground">Export Data:</strong> Download filtered data as CSV for external use</li>
                  <li>• <strong className="text-foreground">Smart Search:</strong> Search across all fields with instant filtering</li>
                </ul>
              </div>

              {/* MentiBY Feedback */}
              <div>
                <h4 className="text-lg font-semibold text-orange-400 mb-3">💬 MentiBY Feedback Analysis</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• <strong className="text-foreground">View Feedback:</strong> Access all student feedback and ratings</li>
                  <li>• <strong className="text-foreground">Rating Analysis:</strong> See overall MentiBY and mentor ratings</li>
                  <li>• <strong className="text-foreground">Expandable Text:</strong> Click cells to view full feedback content</li>
                  <li>• <strong className="text-foreground">Filter by Rating:</strong> Sort by lowest ratings to identify issues</li>
                  <li>• <strong className="text-foreground">Edit Feedback:</strong> Modify feedback entries when needed</li>
                  <li>• <strong className="text-foreground">Bulk Operations:</strong> Select and manage multiple feedback records</li>
                </ul>
              </div>

              {/* XP Leaderboard */}
              <div>
                <h4 className="text-lg font-semibold text-yellow-400 mb-3">� XP Leaderboard System</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• <strong className="text-foreground">Live Rankings:</strong> Real-time student XP rankings from Codedamn</li>
                  <li>• <strong className="text-foreground">Auto Updates:</strong> XP data refreshes automatically every 24 hours</li>
                  <li>• <strong className="text-foreground">Manual Refresh:</strong> Force update XP data with refresh button</li>
                  <li>• <strong className="text-foreground">Filter by Cohort:</strong> View rankings for specific cohort types/numbers</li>
                  <li>• <strong className="text-foreground">Visual Indicators:</strong> Trophy icons for top performers</li>
                  <li>• <strong className="text-foreground">Contact Top Students:</strong> Copy phone numbers of high performers</li>
                  <li>• <strong className="text-foreground">Progress Tracking:</strong> Monitor individual student XP growth</li>
                </ul>
              </div>

              {/* Attendance Records */}
              <div>
                <h4 className="text-lg font-semibold text-blue-400 mb-3">📋 Attendance Records</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• <strong className="text-foreground">Cohort Selection:</strong> Choose specific cohort type and number</li>
                  <li>• <strong className="text-foreground">Attendance Statistics:</strong> View total classes, present count, and percentages</li>
                  <li>• <strong className="text-foreground">Sorted by Performance:</strong> Students with lowest attendance appear first</li>
                  <li>• <strong className="text-foreground">Bulk Contact:</strong> Copy phone numbers of students with poor attendance</li>
                  <li>• <strong className="text-foreground">Search Records:</strong> Find specific students quickly</li>
                  <li>• <strong className="text-foreground">Color-coded Status:</strong> Green (good), yellow (average), red (poor) attendance</li>
                  <li>• <strong className="text-foreground">Switch Batches:</strong> Easily navigate between different cohorts</li>
                </ul>
              </div>

              {/* Calling Agent */}
              <div>
                <h4 className="text-lg font-semibold text-orange-400 mb-3">📞 MentiBY Calling Agent</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• <strong className="text-foreground">Agent Selection:</strong> Choose from preset calling agents (reminders, practice, etc.)</li>
                  <li>• <strong className="text-foreground">Bulk Calls:</strong> Send calls to multiple students at once</li>
                  <li>• <strong className="text-foreground">Phone Management:</strong> Validate and format phone numbers automatically</li>
                  <li>• <strong className="text-foreground">Call Tracking:</strong> Monitor call status and completion rates</li>
                  <li>• <strong className="text-foreground">Conversation Logs:</strong> View call transcripts and durations</li>
                  <li>• <strong className="text-foreground">Scheduled Calls:</strong> Set up automated calling campaigns</li>
                  <li>• <strong className="text-foreground">Agent Types:</strong> Class reminders, attendance checks, XP progress, soft skills</li>
                </ul>
              </div>

              {/* Attendance Upload */}
              <div>
                <h4 className="text-lg font-semibold text-green-400 mb-3">� Attendance Upload System</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• <strong className="text-foreground">CSV Upload:</strong> Drag and drop or select CSV attendance files</li>
                  <li>• <strong className="text-foreground">Auto Table Creation:</strong> System creates database tables automatically</li>
                  <li>• <strong className="text-foreground">Smart Processing:</strong> Handles date columns and student records intelligently</li>
                  <li>• <strong className="text-foreground">Progress Tracking:</strong> Real-time upload progress with detailed feedback</li>
                  <li>• <strong className="text-foreground">Error Handling:</strong> Clear instructions when table setup is needed</li>
                  <li>• <strong className="text-foreground">Copy-paste SQL:</strong> One-click SQL commands for database setup</li>
                  <li>• <strong className="text-foreground">Validation:</strong> Ensures proper file format and data structure</li>
                </ul>
              </div>

              {/* Cohort Charts */}
              <div>
                <h4 className="text-lg font-semibold text-purple-400 mb-3">📈 Cohort Analytics & Charts</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• <strong className="text-foreground">Visual Distribution:</strong> Pie charts showing student distribution by cohort</li>
                  <li>• <strong className="text-foreground">Interactive Charts:</strong> Click cohort types to view detailed breakdowns</li>
                  <li>• <strong className="text-foreground">Statistics Cards:</strong> Quick stats on total students and trends</li>
                  <li>• <strong className="text-foreground">Responsive Design:</strong> Charts adapt to different screen sizes</li>
                  <li>• <strong className="text-foreground">Color-coded Data:</strong> Each cohort type has distinct colors</li>
                  <li>• <strong className="text-foreground">Percentage View:</strong> See proportional distribution of students</li>
                  <li>• <strong className="text-foreground">Real-time Updates:</strong> Charts update automatically with data changes</li>
                </ul>
              </div>

              {/* Common Features */}
              <div>
                <h4 className="text-lg font-semibold text-cyan-400 mb-3">� Common Features Across All Modules</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• <strong className="text-foreground">Phone Copy Feature:</strong> Bulk copy phone numbers from any module for communication</li>
                  <li>• <strong className="text-foreground">Search & Filter:</strong> Universal search functionality across all data tables</li>
                  <li>• <strong className="text-foreground">Mobile Responsive:</strong> All features work seamlessly on mobile devices</li>
                  <li>• <strong className="text-foreground">Real-time Updates:</strong> Changes reflect immediately across all connected modules</li>
                  <li>• <strong className="text-foreground">Toast Notifications:</strong> Success/error messages for all operations</li>
                  <li>• <strong className="text-foreground">Loading States:</strong> Clear progress indicators for all async operations</li>
                  <li>• <strong className="text-foreground">Error Handling:</strong> Graceful error recovery with helpful messages</li>
                </ul>
              </div>

              {/* Navigation & Authentication */}
              <div>
                <h4 className="text-lg font-semibold text-red-400 mb-3">🔐 Navigation & Security</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• <strong className="text-foreground">Secure Login:</strong> Admin-only access with Supabase authentication</li>
                  <li>• <strong className="text-foreground">Session Management:</strong> Auto-logout for security, session persistence</li>
                  <li>• <strong className="text-foreground">Mobile Menu:</strong> Hamburger menu for easy navigation on mobile</li>
                  <li>• <strong className="text-foreground">Tab Switching:</strong> Seamless navigation between different modules</li>
                  <li>• <strong className="text-foreground">User Profile:</strong> Display admin info and last login time</li>
                  <li>• <strong className="text-foreground">Logout Safely:</strong> Secure sign out with confirmation</li>
                  <li>• <strong className="text-foreground">Route Protection:</strong> Unauthorized access automatically redirected</li>
                </ul>
              </div>

              {/* Keyboard Shortcuts */}
              <div>
                <h4 className="text-lg font-semibold text-green-400 mb-3">⌨️ Keyboard Shortcuts & Tips</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• <strong className="text-foreground">Edit Mode:</strong> Double-click any editable cell to start editing</li>
                  <li>• <strong className="text-foreground">Save Changes:</strong> Press <kbd className="px-2 py-1 bg-muted rounded text-xs">Enter</kbd> to save your changes</li>
                  <li>• <strong className="text-foreground">Cancel Edit:</strong> Press <kbd className="px-2 py-1 bg-muted rounded text-xs">Esc</kbd> to cancel without saving</li>
                  <li>• <strong className="text-foreground">Auto-save:</strong> Click outside any cell to automatically save changes</li>
                  <li>• <strong className="text-foreground">Bulk Select:</strong> Use header checkboxes to select/deselect all visible records</li>
                  <li>• <strong className="text-foreground">Smart Sorting:</strong> Enrollment IDs auto-sort by year and number</li>
                  <li>• <strong className="text-foreground">URL Detection:</strong> Valid URLs and emails automatically become clickable</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end mt-6 sm:mt-8">
              <button
                onClick={() => setShowGuide(false)}
                className="px-4 py-2 sm:px-6 sm:py-3 gradient-purple text-white rounded-xl font-medium transition-all duration-300 flex items-center space-x-2 hover:scale-105 glow-purple text-sm sm:text-base"
              >
                <span>Got it!</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Goal Popup Modal */}
      {goalPopup.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-card/90 backdrop-blur-xl border border-border/50 rounded-xl sm:rounded-2xl p-4 sm:p-8 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <div>
                <h3 className="text-xl sm:text-2xl font-bold gradient-text">Student Goal</h3>
                <p className="text-sm text-muted-foreground mt-1">{goalPopup.studentName}</p>
              </div>
              <button
                onClick={closeGoalPopup}
                className="p-2 hover:bg-muted/50 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-muted/20 rounded-lg p-4 sm:p-6">
              <div className="text-foreground whitespace-pre-wrap leading-relaxed">
                {goalPopup.content}
              </div>
            </div>

            <div className="flex justify-end mt-4 sm:mt-6 gap-3">
              <button
                onClick={closeGoalPopup}
                className="px-4 py-2 sm:px-6 sm:py-3 bg-muted/50 hover:bg-muted/70 text-foreground rounded-xl font-medium transition-all duration-300 text-sm sm:text-base"
              >
                Close
              </button>
              <button
                onClick={() => {
                  closeGoalPopup()
                  // Find the row and trigger edit mode for Goal
                  const targetRow = filteredData.find(r => r['Full Name'] === goalPopup.studentName)
                  if (targetRow) {
                    handleCellDoubleClick(targetRow.EnrollmentID, 'Goal', targetRow.Goal)
                  }
                }}
                className="px-4 py-2 sm:px-6 sm:py-3 gradient-purple text-white rounded-xl font-medium transition-all duration-300 hover:scale-105 glow-purple text-sm sm:text-base"
              >
                Edit Goal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="bg-card/50 backdrop-blur-xl border border-border/50 rounded-xl sm:rounded-2xl p-4 sm:p-6 space-y-4">
          <h3 className="text-lg font-semibold gradient-text">Filters</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Cohort Type
              </label>
              <select
                value={filters.cohortType}
                onChange={(e) => setFilters(prev => ({ ...prev, cohortType: e.target.value }))}
                className="w-full px-4 py-3 bg-input/50 backdrop-blur-sm border border-border/50 rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">All Types</option>
                {cohortTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Cohort Number
              </label>
              <input
                type="text"
                placeholder="e.g., 1.0, 2.0"
                value={filters.cohortNumber}
                onChange={(e) => setFilters(prev => ({ ...prev, cohortNumber: e.target.value }))}
                className="w-full px-4 py-3 bg-input/50 backdrop-blur-sm border border-border/50 rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search all fields..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-input/50 backdrop-blur-sm border border-border/50 rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table Container - Full height with scrollbar at bottom */}
      <div className="flex-1 bg-card/50 backdrop-blur-xl border border-border/50 rounded-xl sm:rounded-2xl overflow-hidden">
        <div className="h-full overflow-auto">
          <table className="w-full min-w-max table-auto">
            <thead className="bg-muted/30 backdrop-blur-sm sticky top-0 z-10">
              <tr>
                {(showDeleteMode || showPhoneCopyMode) && (
                  <th className="px-2 py-3 sm:px-4 sm:py-4 text-left text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap w-8 sm:w-12">
                    <input
                      type="checkbox"
                      checked={selectedRows.size === filteredData.length && filteredData.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="w-3 h-3 sm:w-4 sm:h-4 text-primary bg-transparent border-border rounded focus:ring-primary focus:ring-2"
                    />
                  </th>
                )}
                <th className="px-2 py-3 sm:px-4 sm:py-4 text-left text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap">ID</th>
                <th className="px-2 py-3 sm:px-4 sm:py-4 text-left text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap">Type</th>
                <th className="px-2 py-3 sm:px-4 sm:py-4 text-left text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap">Number</th>
                <th className="px-2 py-3 sm:px-4 sm:py-4 text-left text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap">Name</th>
                <th className="px-2 py-3 sm:px-4 sm:py-4 text-left text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap">Email</th>
                <th className="px-2 py-3 sm:px-4 sm:py-4 text-left text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap">Phone</th>
                <th className="px-2 py-3 sm:px-4 sm:py-4 text-left text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap">LinkedIn</th>
                <th className="px-2 py-3 sm:px-4 sm:py-4 text-left text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap">GitHub</th>
                <th className="px-2 py-3 sm:px-4 sm:py-4 text-left text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap">HackerRank</th>
                <th className="px-2 py-3 sm:px-4 sm:py-4 text-left text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap">College</th>
                <th className="px-2 py-3 sm:px-4 sm:py-4 text-left text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap">State</th>
                <th className="px-2 py-3 sm:px-4 sm:py-4 text-left text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap">Year</th>
                <th className="px-2 py-3 sm:px-4 sm:py-4 text-left text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap">Branch</th>
                <th className="px-2 py-3 sm:px-4 sm:py-4 text-left text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap">Grad</th>
                <th className="px-2 py-3 sm:px-4 sm:py-4 text-left text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap">Understanding</th>
                <th className="px-2 py-3 sm:px-4 sm:py-4 text-left text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap">Skills</th>
                <th className="px-2 py-3 sm:px-4 sm:py-4 text-left text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap">Projects</th>
                <th className="px-2 py-3 sm:px-4 sm:py-4 text-left text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap">Goal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {filteredData.map((row) => (
                <tr key={row.EnrollmentID} className="hover:bg-muted/20 transition-all duration-200">
                  {(showDeleteMode || showPhoneCopyMode) && (
                    <td className="px-2 py-3 sm:px-4 sm:py-4 text-xs sm:text-sm whitespace-nowrap w-8 sm:w-12">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(row.EnrollmentID)}
                        onChange={(e) => handleRowSelect(row.EnrollmentID, e.target.checked)}
                        className="w-3 h-3 sm:w-4 sm:h-4 text-primary bg-transparent border-border rounded focus:ring-primary focus:ring-2"
                      />
                    </td>
                  )}
                  <td className="px-2 py-3 sm:px-4 sm:py-4 text-xs sm:text-sm text-blue-400 font-mono font-semibold whitespace-nowrap">{row.EnrollmentID}</td>
                  <td className="px-2 py-3 sm:px-4 sm:py-4 text-xs sm:text-sm whitespace-nowrap">
                    <div
                      className="editable-cell min-h-[20px] relative"
                      onDoubleClick={() => handleCellDoubleClick(row.EnrollmentID, 'Cohort Type', row['Cohort Type'])}
                    >
                      {renderCell(row, 'Cohort Type', row['Cohort Type'])}
                    </div>
                  </td>
                  <td className="px-2 py-3 sm:px-4 sm:py-4 text-xs sm:text-sm whitespace-nowrap">
                    <div
                      className="editable-cell text-foreground font-medium min-h-[20px] relative"
                      onDoubleClick={() => handleCellDoubleClick(row.EnrollmentID, 'Cohort Number', row['Cohort Number'])}
                    >
                      {renderCell(row, 'Cohort Number', row['Cohort Number'])}
                    </div>
                  </td>
                  <td className="px-2 py-3 sm:px-4 sm:py-4 text-xs sm:text-sm whitespace-nowrap">
                    <div
                      className="editable-cell text-foreground font-medium min-h-[20px] relative"
                      onDoubleClick={() => handleCellDoubleClick(row.EnrollmentID, 'Full Name', row['Full Name'])}
                    >
                      {renderCell(row, 'Full Name', row['Full Name'])}
                    </div>
                  </td>
                  <td className="px-2 py-3 sm:px-4 sm:py-4 text-xs sm:text-sm whitespace-nowrap">
                    <div
                      className="editable-cell min-h-[20px] relative"
                      onDoubleClick={() => handleCellDoubleClick(row.EnrollmentID, 'Email', row.Email)}
                    >
                      {renderCell(row, 'Email', row.Email)}
                    </div>
                  </td>
                  <td className="px-2 py-3 sm:px-4 sm:py-4 text-xs sm:text-sm whitespace-nowrap">
                    <div
                      className="editable-cell text-muted-foreground min-h-[20px] relative"
                      onDoubleClick={() => handleCellDoubleClick(row.EnrollmentID, 'Phone Number', row['Phone Number'])}
                    >
                      {renderCell(row, 'Phone Number', row['Phone Number'])}
                    </div>
                  </td>
                  <td className="px-2 py-3 sm:px-4 sm:py-4 text-xs sm:text-sm whitespace-nowrap">
                    <div
                      className="editable-cell min-h-[20px] relative"
                      onDoubleClick={() => handleCellDoubleClick(row.EnrollmentID, 'LinkedIn', row.LinkedIn)}
                    >
                      {renderCell(row, 'LinkedIn', row.LinkedIn)}
                    </div>
                  </td>
                  <td className="px-2 py-3 sm:px-4 sm:py-4 text-xs sm:text-sm whitespace-nowrap">
                    <div
                      className="editable-cell min-h-[20px] relative"
                      onDoubleClick={() => handleCellDoubleClick(row.EnrollmentID, 'GitHub', row.GitHub)}
                    >
                      {renderCell(row, 'GitHub', row.GitHub)}
                    </div>
                  </td>
                  <td className="px-2 py-3 sm:px-4 sm:py-4 text-xs sm:text-sm whitespace-nowrap">
                    <div
                      className="editable-cell text-muted-foreground min-h-[20px] relative"
                      onDoubleClick={() => handleCellDoubleClick(row.EnrollmentID, 'Hackerrank', row.Hackerrank)}
                    >
                      {renderCell(row, 'Hackerrank', row.Hackerrank)}
                    </div>
                  </td>
                  <td className="px-2 py-3 sm:px-4 sm:py-4 text-xs sm:text-sm whitespace-nowrap">
                    <div
                      className="editable-cell text-foreground min-h-[20px] relative"
                      onDoubleClick={() => handleCellDoubleClick(row.EnrollmentID, 'College', row.College)}
                    >
                      {renderCell(row, 'College', row.College)}
                    </div>
                  </td>
                  <td className="px-2 py-3 sm:px-4 sm:py-4 text-xs sm:text-sm whitespace-nowrap">
                    <div
                      className="editable-cell text-muted-foreground min-h-[20px] relative"
                      onDoubleClick={() => handleCellDoubleClick(row.EnrollmentID, 'College State', row['College State'])}
                    >
                      {renderCell(row, 'College State', row['College State'])}
                    </div>
                  </td>
                  <td className="px-2 py-3 sm:px-4 sm:py-4 text-xs sm:text-sm whitespace-nowrap">
                    <div
                      className="editable-cell text-muted-foreground min-h-[20px] relative"
                      onDoubleClick={() => handleCellDoubleClick(row.EnrollmentID, 'College Year', row['College Year'])}
                    >
                      {renderCell(row, 'College Year', row['College Year'])}
                    </div>
                  </td>
                  <td className="px-2 py-3 sm:px-4 sm:py-4 text-xs sm:text-sm whitespace-nowrap">
                    <div
                      className="editable-cell text-muted-foreground min-h-[20px] relative"
                      onDoubleClick={() => handleCellDoubleClick(row.EnrollmentID, 'Branch', row.Branch)}
                    >
                      {renderCell(row, 'Branch', row.Branch)}
                    </div>
                  </td>
                  <td className="px-2 py-3 sm:px-4 sm:py-4 text-xs sm:text-sm whitespace-nowrap">
                    <div
                      className="editable-cell text-foreground min-h-[20px] relative"
                      onDoubleClick={() => handleCellDoubleClick(row.EnrollmentID, 'Graduation Year', row['Graduation Year'])}
                    >
                      {renderCell(row, 'Graduation Year', row['Graduation Year'])}
                    </div>
                  </td>
                  <td className="px-2 py-3 sm:px-4 sm:py-4 text-xs sm:text-sm">
                    <div
                      className="editable-cell text-muted-foreground min-h-[20px] max-w-[150px] sm:max-w-[200px] relative"
                      onDoubleClick={() => handleCellDoubleClick(row.EnrollmentID, 'Understanding', row.Understanding)}
                    >
                      {renderCell(row, 'Understanding', row.Understanding)}
                    </div>
                  </td>
                  <td className="px-2 py-3 sm:px-4 sm:py-4 text-xs sm:text-sm">
                    <div
                      className="editable-cell text-muted-foreground min-h-[20px] max-w-[150px] sm:max-w-[200px] relative"
                      onDoubleClick={() => handleCellDoubleClick(row.EnrollmentID, 'Familiar Skills', row['Familiar Skills'])}
                    >
                      {renderCell(row, 'Familiar Skills', row['Familiar Skills'])}
                    </div>
                  </td>
                  <td className="px-2 py-3 sm:px-4 sm:py-4 text-xs sm:text-sm">
                    <div
                      className="editable-cell text-muted-foreground min-h-[20px] max-w-[150px] sm:max-w-[200px] relative"
                      onDoubleClick={() => handleCellDoubleClick(row.EnrollmentID, 'Built Projects', row['Built Projects'])}
                    >
                      {renderCell(row, 'Built Projects', row['Built Projects'])}
                    </div>
                  </td>
                  <td className="px-2 py-3 sm:px-4 sm:py-4 text-xs sm:text-sm">
                    <div
                      className="editable-cell text-muted-foreground min-h-[20px] max-w-[200px] sm:max-w-[300px] relative cursor-pointer hover:bg-muted/30 rounded transition-colors"
                      onClick={() => handleGoalClick(row.Goal, row['Full Name'])}
                      onDoubleClick={() => handleCellDoubleClick(row.EnrollmentID, 'Goal', row.Goal)}
                      title="Click to view full goal, double-click to edit"
                    >
                      {renderCell(row, 'Goal', row.Goal)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredData.length === 0 && (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-muted/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-lg">No data found matching your criteria.</p>
            </div>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      {toastNotification.show && (
        <div
          className={cn(
            "fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 px-6 py-4 rounded-xl backdrop-blur-lg border transition-all duration-500 ease-out",
            "animate-in slide-in-from-bottom-4 fade-in-0",
            toastNotification.type === 'success'
              ? "bg-green-500/20 border-green-500/30 text-green-300 shadow-lg shadow-green-500/20"
              : "bg-red-500/20 border-red-500/30 text-red-300 shadow-lg shadow-red-500/20"
          )}
        >
          <div className="flex items-center space-x-3">
            {toastNotification.type === 'success' ? (
              <div className="w-5 h-5 rounded-full bg-green-500/30 flex items-center justify-center">
                <Copy className="w-3 h-3 text-green-400" />
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full bg-red-500/30 flex items-center justify-center">
                <X className="w-3 h-3 text-red-400" />
              </div>
            )}
            <span className="text-sm font-medium">{toastNotification.message}</span>
          </div>
        </div>
      )}
    </div>
  )
} 