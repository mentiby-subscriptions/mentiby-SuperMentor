'use client'

import { useState, useEffect } from 'react'
import { Search, Download, Plus, Trash2, X, HelpCircle, Phone, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MentorData {
  mentor_id: number
  Name: string
  'Email address': string
  'Mobile number': number | string
  'Date of Birth (DOB)': string
  Gender: string
  'Current state': string
  'Current city': string
  'College name:': string
  Degree: string
  'Current Year': string
  Expertise: string
  'Projects?': string
  'Current Company': string
  LinkedIn: string
  GitHub: string
  'Full Stack Project Interest?': string
  'Aadhar Number': number | string
  'PAN Card Number': string
  'Bank Name': string
  'Branch Name': string
  'Account holder name': string
  'Account Type': string
  'IFSC Code': string
  'Bank Account Number': number | string
  'UPI ID (Optional)': string
  'Emergency Contact Name': string
  'Emergency Contact Number': number | string
  [key: string]: any
}

// Ordered columns matching DB schema
const COLUMN_ORDER: string[] = [
  'mentor_id',
  'Name',
  'Mobile number',
  'Email address',
  'Date of Birth (DOB)',
  'Gender',
  'Current state',
  'Current city',
  'College name:',
  'Degree',
  'Current Year',
  'Expertise',
  'Projects?',
  'Current Company',
  'LinkedIn',
  'GitHub',
  'Full Stack Project Interest?',
  'Aadhar Number',
  'PAN Card Number',
  'Bank Name',
  'Branch Name',
  'Account holder name',
  'Account Type',
  'IFSC Code',
  'Bank Account Number',
  'UPI ID (Optional)',
  'Emergency Contact Name',
  'Emergency Contact Number',
  'I agree to maintain confidentiality and not disclose any intern',
  'I agree to maintain discipline, punctuality, and contribute act',
  'I authorize MentiBY to use the above information solely for int',
  'Digital Signature: (Type your full name)',
  'How many hours per day can you dedicate to the Mentiby Full Sta',
  'I agree to the terms & conditions mentioned above',
]

const COLUMN_LABELS: Record<string, string> = {
  'mentor_id': 'ID',
  'Name': 'Name',
  'Mobile number': 'Phone',
  'Email address': 'Email',
  'Date of Birth (DOB)': 'DOB',
  'Gender': 'Gender',
  'Current state': 'State',
  'Current city': 'City',
  'College name:': 'College',
  'Degree': 'Degree',
  'Current Year': 'Year',
  'Expertise': 'Expertise',
  'Projects?': 'Projects',
  'Current Company': 'Company',
  'LinkedIn': 'LinkedIn',
  'GitHub': 'GitHub',
  'Full Stack Project Interest?': 'FS Interest',
  'Aadhar Number': 'Aadhar',
  'PAN Card Number': 'PAN',
  'Bank Name': 'Bank',
  'Branch Name': 'Branch',
  'Account holder name': 'Acc Holder',
  'Account Type': 'Acc Type',
  'IFSC Code': 'IFSC',
  'Bank Account Number': 'Acc No.',
  'UPI ID (Optional)': 'UPI',
  'Emergency Contact Name': 'Emergency Name',
  'Emergency Contact Number': 'Emergency No.',
  'I agree to maintain confidentiality and not disclose any intern': 'Confidentiality',
  'I agree to maintain discipline, punctuality, and contribute act': 'Discipline',
  'I authorize MentiBY to use the above information solely for int': 'Auth Info Use',
  'Digital Signature: (Type your full name)': 'Signature',
  'How many hours per day can you dedicate to the Mentiby Full Sta': 'Hours/Day',
  'I agree to the terms & conditions mentioned above': 'T&C Agreed',
}

// Bigint fields that should be treated as numbers
const BIGINT_FIELDS = new Set([
  'Mobile number',
  'Aadhar Number',
  'Bank Account Number',
  'Emergency Contact Number',
])

// Link fields
const LINK_FIELDS = new Set(['LinkedIn', 'GitHub'])

interface EditingCell {
  rowId: number
  field: string
  value: string
  originalValue: string
}

export default function MentorInfo() {
  const [data, setData] = useState<MentorData[]>([])
  const [filteredData, setFilteredData] = useState<MentorData[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [showAddForm, setShowAddForm] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [showDeleteMode, setShowDeleteMode] = useState(false)
  const [showPhoneCopyMode, setShowPhoneCopyMode] = useState(false)
  const [toastNotification, setToastNotification] = useState<{
    show: boolean
    message: string
    type: 'success' | 'error'
  }>({ show: false, message: '', type: 'success' })
  const [newRowData, setNewRowData] = useState<Partial<MentorData>>({})
  const [error, setError] = useState<string | null>(null)

  // Columns to render — ordered from schema, plus any extras from data
  const [displayColumns, setDisplayColumns] = useState<string[]>(COLUMN_ORDER)

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToastNotification({ show: true, message, type })
    setTimeout(() => {
      setToastNotification({ show: false, message: '', type: 'success' })
    }, 2000)
  }

  const fetchData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const res = await fetch('/api/mentors/details')
      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || 'Failed to fetch mentor details')
      }

      const mentors: MentorData[] = json.mentors || []
      setData(mentors)

      // Build display columns: schema order first, then any extra cols from data
      if (mentors.length > 0) {
        const dataKeys = Object.keys(mentors[0])
        const knownSet = new Set(COLUMN_ORDER)
        const extras = dataKeys.filter(k => !knownSet.has(k))
        setDisplayColumns([...COLUMN_ORDER.filter(c => dataKeys.includes(c)), ...extras])
      }
    } catch (err) {
      console.error('Error fetching mentor data:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    let filtered = [...data]
    filtered.sort((a, b) => a.mentor_id - b.mentor_id)

    if (searchTerm) {
      filtered = filtered.filter(item =>
        Object.values(item).some(value =>
          String(value).toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    }

    setFilteredData(filtered)
  }, [data, searchTerm])

  const handleCellDoubleClick = (rowId: number, field: string, value: any) => {
    if (field === 'mentor_id') return
    setEditingCell({
      rowId,
      field,
      value: String(value ?? ''),
      originalValue: String(value ?? '')
    })
  }

  const handleSaveEdit = async () => {
    if (!editingCell || isSaving) return
    if (editingCell.value === editingCell.originalValue) {
      setEditingCell(null)
      return
    }

    try {
      setIsSaving(true)

      let updateValue: any = editingCell.value
      if (BIGINT_FIELDS.has(editingCell.field)) {
        updateValue = editingCell.value ? Number(editingCell.value) : null
      }

      const res = await fetch('/api/mentors/details', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mentor_id: editingCell.rowId,
          field: editingCell.field,
          value: updateValue
        })
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || 'Failed to update')
      }

      setEditingCell(null)
      showToast('Updated successfully')
      fetchData()
    } catch (error) {
      console.error('Update failed:', error)
      if (editingCell) {
        setEditingCell(prev => prev ? { ...prev, value: prev.originalValue } : null)
      }
      showToast(`Failed to update: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingCell(null)
  }

  const generateNextMentorId = () => {
    if (data.length === 0) return 1
    const maxId = Math.max(...data.map(m => m.mentor_id))
    return maxId + 1
  }

  const handleAddRow = async () => {
    try {
      setIsSaving(true)

      const mentorId = newRowData.mentor_id || generateNextMentorId()

      const newRecord: any = { mentor_id: mentorId }
      for (const col of displayColumns) {
        if (col === 'mentor_id') continue
        if (newRowData[col] !== undefined && newRowData[col] !== '') {
          newRecord[col] = BIGINT_FIELDS.has(col) ? Number(newRowData[col]) : newRowData[col]
        }
      }

      const res = await fetch('/api/mentors/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRecord)
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || 'Failed to add mentor')
      }

      setNewRowData({})
      setShowAddForm(false)
      showToast('Mentor added successfully')
      fetchData()
    } catch (error) {
      console.error('Add failed:', error)
      showToast(`Failed to add mentor: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteRows = async () => {
    if (selectedRows.size === 0) return

    const confirmed = confirm(`Are you sure you want to delete ${selectedRows.size} mentor(s)? This action cannot be undone.`)
    if (!confirmed) return

    try {
      setIsSaving(true)

      const idsToDelete = Array.from(selectedRows)

      const res = await fetch('/api/mentors/details', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mentor_ids: idsToDelete })
      })

      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error || 'Failed to delete mentors')
      }

      setSelectedRows(new Set())
      setShowDeleteMode(false)
      showToast(`Deleted ${idsToDelete.length} mentor(s)`)
      fetchData()
    } catch (error) {
      console.error('Delete failed:', error)
      showToast(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCopyPhoneNumbers = async () => {
    if (selectedRows.size === 0) return

    try {
      const selectedData = filteredData.filter(row => selectedRows.has(row.mentor_id))

      const phoneNumbers = selectedData
        .map(row => String(row['Mobile number'] || ''))
        .filter(phone => phone && phone.trim() !== '' && phone !== '-' && phone !== '0' && !phone.includes('undefined') && phone !== 'null')

      if (phoneNumbers.length === 0) {
        showToast('No valid phone numbers found in selected rows!', 'error')
        return
      }

      const phoneText = phoneNumbers.join('\n')
      await navigator.clipboard.writeText(phoneText)

      setSelectedRows(new Set())
      setShowPhoneCopyMode(false)

      showToast(`Copied ${phoneNumbers.length} phone numbers to clipboard!`)
    } catch (error) {
      console.error('Copy failed:', error)
      showToast(`Failed to copy phone numbers: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
    }
  }

  const handleRowSelect = (mentorId: number, isSelected: boolean) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev)
      if (isSelected) {
        newSet.add(mentorId)
      } else {
        newSet.delete(mentorId)
      }
      return newSet
    })
  }

  const handleSelectAll = (isSelected: boolean) => {
    if (isSelected) {
      setSelectedRows(new Set(filteredData.map(row => row.mentor_id)))
    } else {
      setSelectedRows(new Set())
    }
  }

  const exportData = () => {
    if (filteredData.length === 0) return
    const headers = displayColumns
    const csv = [
      headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
      ...filteredData.map(row =>
        headers.map(header => `"${String(row[header] ?? '').replace(/"/g, '""')}"`).join(',')
      )
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'mentor-details.csv'
    link.click()
  }

  const renderCell = (row: MentorData, field: string, value: any) => {
    const isEditing = editingCell?.rowId === row.mentor_id && editingCell?.field === field

    if (isEditing) {
      return (
        <div className="editing-cell">
          <input
            type={BIGINT_FIELDS.has(field) ? 'number' : 'text'}
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

    // Email rendering
    if (field === 'Email address') {
      const isValidEmail = value && value !== '-' && String(value).trim() !== '' && String(value).includes('@')
      return isValidEmail ? (
        <a href={`mailto:${value}`} className="text-blue-400 hover:text-blue-300 underline">
          {value}
        </a>
      ) : (
        <span className="text-muted-foreground">-</span>
      )
    }

    // LinkedIn / GitHub link rendering
    if (LINK_FIELDS.has(field)) {
      const isValidUrl = value && value !== '-' && String(value).trim() !== '' && !String(value).includes('undefined')
      return isValidUrl ? (
        <a
          href={String(value).startsWith('http') ? String(value) : `https://${value}`}
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

    return <span className="truncate">{value != null && String(value) !== '' ? String(value) : '-'}</span>
  }

  const getColumnLabel = (col: string) => {
    return COLUMN_LABELS[col] || col
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-destructive/20 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6 glow-purple">
            <svg className="w-8 h-8 sm:w-10 sm:h-10 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-xl sm:text-2xl font-semibold gradient-text mb-2 sm:mb-3">Error Loading Data</h3>
          <p className="text-muted-foreground mb-4 sm:mb-6 text-sm sm:text-base">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 sm:px-6 sm:py-3 gradient-purple text-white rounded-xl hover:scale-105 transition-all duration-300 font-medium glow-purple text-sm sm:text-base"
          >
            Retry Connection
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 pt-2 sm:pt-0">
        <div>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold gradient-text">Mentor Details</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Showing {filteredData.length} of {data.length} mentors
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 sm:pl-10 pr-3 py-2 w-36 sm:w-48 bg-input/50 backdrop-blur-sm border border-border/50 rounded-lg text-xs sm:text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
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
              setShowDeleteMode(false)
              if (!showPhoneCopyMode) setSelectedRows(new Set())
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
              setShowPhoneCopyMode(false)
              if (!showDeleteMode) setSelectedRows(new Set())
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
              <h3 className="text-xl sm:text-2xl font-bold gradient-text">Add New Mentor</h3>
              <button
                onClick={() => setShowAddForm(false)}
                className="p-2 hover:bg-muted/50 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {displayColumns.map(col => (
                <div key={col}>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    {getColumnLabel(col)}
                    {(col === 'Name' || col === 'Email address') && ' *'}
                  </label>
                  <input
                    type={BIGINT_FIELDS.has(col) || col === 'mentor_id' ? 'number' : col === 'Email address' ? 'email' : 'text'}
                    value={newRowData[col] ?? ''}
                    onChange={(e) => setNewRowData(prev => ({ ...prev, [col]: e.target.value }))}
                    placeholder={col === 'mentor_id' ? String(generateNextMentorId()) : ''}
                    className="w-full px-4 py-3 bg-input/50 backdrop-blur-sm border border-border/50 rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
              ))}
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
                    <span>Add Mentor</span>
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
              <h3 className="text-xl sm:text-2xl font-bold text-cyan-400">Mentor Details Guide</h3>
              <button
                onClick={() => setShowGuide(false)}
                className="p-2 hover:bg-muted/50 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6 text-foreground">
              <div>
                <h4 className="text-lg font-semibold text-blue-400 mb-3">Mentor Data Management</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>&#8226; <strong className="text-foreground">View Records:</strong> Browse all mentor details including personal, academic, and bank info</li>
                  <li>&#8226; <strong className="text-foreground">Edit Inline:</strong> Double-click any cell to edit values directly</li>
                  <li>&#8226; <strong className="text-foreground">Add Mentors:</strong> Use &quot;Add&quot; button to create new mentor records</li>
                  <li>&#8226; <strong className="text-foreground">Bulk Delete:</strong> Select multiple records and delete them together</li>
                  <li>&#8226; <strong className="text-foreground">Phone Copy:</strong> Copy phone numbers in bulk for communication</li>
                  <li>&#8226; <strong className="text-foreground">Export Data:</strong> Download filtered data as CSV</li>
                  <li>&#8226; <strong className="text-foreground">Smart Search:</strong> Search across all fields with instant filtering</li>
                </ul>
              </div>

              <div>
                <h4 className="text-lg font-semibold text-green-400 mb-3">Keyboard Shortcuts</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>&#8226; <strong className="text-foreground">Edit Mode:</strong> Double-click any editable cell to start editing</li>
                  <li>&#8226; <strong className="text-foreground">Save Changes:</strong> Press <kbd className="px-2 py-1 bg-muted rounded text-xs">Enter</kbd> to save</li>
                  <li>&#8226; <strong className="text-foreground">Cancel Edit:</strong> Press <kbd className="px-2 py-1 bg-muted rounded text-xs">Esc</kbd> to cancel</li>
                  <li>&#8226; <strong className="text-foreground">Auto-save:</strong> Click outside any cell to automatically save</li>
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

      {/* Table Container */}
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
                {displayColumns.map(col => (
                  <th key={col} className="px-2 py-3 sm:px-4 sm:py-4 text-left text-xs sm:text-sm font-semibold text-foreground whitespace-nowrap">
                    {getColumnLabel(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {filteredData.map((row) => (
                <tr key={row.mentor_id} className="hover:bg-muted/20 transition-all duration-200">
                  {(showDeleteMode || showPhoneCopyMode) && (
                    <td className="px-2 py-3 sm:px-4 sm:py-4 text-xs sm:text-sm whitespace-nowrap w-8 sm:w-12">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(row.mentor_id)}
                        onChange={(e) => handleRowSelect(row.mentor_id, e.target.checked)}
                        className="w-3 h-3 sm:w-4 sm:h-4 text-primary bg-transparent border-border rounded focus:ring-primary focus:ring-2"
                      />
                    </td>
                  )}
                  {displayColumns.map(col => (
                    <td key={col} className="px-2 py-3 sm:px-4 sm:py-4 text-xs sm:text-sm whitespace-nowrap">
                      {col === 'mentor_id' ? (
                        <span className="text-blue-400 font-mono font-semibold">{row.mentor_id}</span>
                      ) : (
                        <div
                          className="editable-cell min-h-[20px] relative"
                          onDoubleClick={() => handleCellDoubleClick(row.mentor_id, col, row[col])}
                        >
                          {renderCell(row, col, row[col])}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {filteredData.length === 0 && (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-muted/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-lg">No mentors found matching your criteria.</p>
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
