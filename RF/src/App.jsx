import { useEffect, useMemo, useState } from 'react'
import { signInAnonymously } from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { auth, db } from './firebase/config'
import { decryptEmployee, encryptEmployee } from './utils/crypto'
import LockerExportModal from './components/LockerExportModal'
import './App.css'

const DAYS = [
  { label: 'Sunday', abbreviation: 'Sun' },
  { label: 'Monday', abbreviation: 'Mon' },
  { label: 'Tuesday', abbreviation: 'Tue' },
  { label: 'Wednesday', abbreviation: 'Wed' },
  { label: 'Thursday', abbreviation: 'Thu' },
  { label: 'Friday', abbreviation: 'Fri' },
  { label: 'Saturday', abbreviation: 'Sat' },
]

const RESERVED_LOCKERS = {
  'DIS-14': 'Dispatch Supervisor',
  'DIS-15': 'Dispatch Supervisor',
  'DIS-16': 'Temp. Gun',
  'DIS-17': 'Reserved',
}

const emptyForm = {
  name: '',
  shift: 'Day',
  days: [],
}

function App() {
  const [activeTab, setActiveTab] = useState('rfs')
  const [employees, setEmployees] = useState([])
  const [lockers, setLockers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [isSaving, setIsSaving] = useState(false)
  const [employeeToDelete, setEmployeeToDelete] = useState(null)
  const [draggedEmployeeId, setDraggedEmployeeId] = useState(null)
  const [isUpdatingLocker, setIsUpdatingLocker] = useState(false)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null)
  const [isExportPreviewOpen, setIsExportPreviewOpen] = useState(false)

  useEffect(() => {
    let unsubscribeEmployees = () => {}
    let unsubscribeLockers = () => {}

    const startApp = async () => {
      try {
        if (!auth.currentUser) {
          await signInAnonymously(auth)
        }

        unsubscribeEmployees = onSnapshot(
          collection(db, 'employees'),
          async (snapshot) => {
            try {
              const decryptedEmployees = await Promise.all(
                snapshot.docs.map(async (employeeDoc) => {
                  const decryptedEmployee = await decryptEmployee(
                    employeeDoc.data()
                  )

                  return {
                    id: employeeDoc.id,
                    ...decryptedEmployee,
                  }
                })
              )

              decryptedEmployees.sort((a, b) =>
                a.name.localeCompare(b.name)
              )

              setEmployees(decryptedEmployees)
              setError('')
            } catch (decryptError) {
              console.error(decryptError)
              setError(
                'Unable to decrypt employee data. Check that your encryption key has not changed.'
              )
            } finally {
              setLoading(false)
            }
          },
          (firestoreError) => {
            console.error(firestoreError)
            setError('Unable to access employee information from Firestore.')
            setLoading(false)
          }
        )

        unsubscribeLockers = onSnapshot(
          collection(db, 'lockers'),
          async (snapshot) => {
            try {
              const decryptedLockers = await Promise.all(
                snapshot.docs.map(async (lockerDoc) => {
                  const decryptedLocker = await decryptEmployee(lockerDoc.data())

                  return {
                    id: lockerDoc.id,
                    lockerNumber: decryptedLocker.lockerNumber,
                    combination: decryptedLocker.combination,
                    dayEmployeeIds: decryptedLocker.dayEmployeeIds || [],
                    nightEmployeeIds: decryptedLocker.nightEmployeeIds || [],
                  }
                })
              )

              decryptedLockers.sort((a, b) => {
                const lockerA = Number(a.lockerNumber.replace('DIS-', ''))
                const lockerB = Number(b.lockerNumber.replace('DIS-', ''))

                return lockerA - lockerB
              })

              setLockers(decryptedLockers)
            } catch (decryptError) {
              console.error(decryptError)
              setError(
                'Unable to decrypt locker data. Check that your encryption key has not changed.'
              )
            }
          },
          (firestoreError) => {
            console.error(firestoreError)
            setError('Unable to access locker information from Firestore.')
          }
        )
      } catch (authError) {
        console.error(authError)
        setError(
          'Unable to sign in anonymously. Enable Anonymous Authentication in Firebase Authentication settings.'
        )
        setLoading(false)
      }
    }

    startApp()

    return () => {
      unsubscribeEmployees()
      unsubscribeLockers()
    }
  }, [])

  const dayShiftEmployees = useMemo(
    () => employees.filter((employee) => employee.shift === 'Day'),
    [employees]
  )

  const nightShiftEmployees = useMemo(
    () => employees.filter((employee) => employee.shift === 'Night'),
    [employees]
  )

  const assignedEmployeeIds = lockers.flatMap((locker) => [
    ...(locker.dayEmployeeIds || []),
    ...(locker.nightEmployeeIds || []),
  ])

  const availableEmployees = employees.filter(
    (employee) => !assignedEmployeeIds.includes(employee.id)
  )

  const availableDayEmployees = availableEmployees.filter(
    (employee) => employee.shift === 'Day'
  )

  const availableNightEmployees = availableEmployees.filter(
    (employee) => employee.shift === 'Night'
  )

  const formatDays = (days) =>
    DAYS.filter((day) => days.includes(day.label))
      .map((day) => day.abbreviation)
      .join(', ')

  const employeeById = (employeeId) =>
    employees.find((employee) => employee.id === employeeId)

  const employeeNameById = (employeeId) => {
    const employee = employeeById(employeeId)
    return employee ? employee.name : 'Unknown employee'
  }

  const schedulesOverlap = (firstDays = [], secondDays = []) =>
    firstDays.some((day) => secondDays.includes(day))

  const getLockerAssignmentField = (employee) =>
    employee.shift === 'Day' ? 'dayEmployeeIds' : 'nightEmployeeIds'

  const isReservedLocker = (locker) =>
    Boolean(RESERVED_LOCKERS[locker.lockerNumber])

  const lockerCanAcceptEmployee = (locker, employee) => {
    if (!employee || isReservedLocker(locker)) {
      return false
    }

    const assignmentField = getLockerAssignmentField(employee)
    const assignedIds = locker[assignmentField] || []

    return assignedIds.every((assignedEmployeeId) => {
      const assignedEmployee = employeeById(assignedEmployeeId)

      if (!assignedEmployee) {
        return true
      }

      return !schedulesOverlap(employee.days, assignedEmployee.days)
    })
  }

  const getSuggestedLockers = (employee) =>
    lockers.filter((locker) => lockerCanAcceptEmployee(locker, employee))

  const getSuggestionText = (employee) => {
    const suggestedLockers = getSuggestedLockers(employee)

    if (suggestedLockers.length === 0) {
      return 'No compatible RF lockers are currently available.'
    }

    return `Suggested RFs: ${suggestedLockers
      .map((locker) => locker.lockerNumber)
      .join(', ')}`
  }

  const openAddModal = (shift = 'Day') => {
    setEditingEmployee(null)
    setFormData({
      ...emptyForm,
      shift,
    })
    setIsModalOpen(true)
  }

  const openEditModal = (employee) => {
    setEditingEmployee(employee)
    setFormData({
      name: employee.name,
      shift: employee.shift,
      days: employee.days,
    })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    if (isSaving) return

    setIsModalOpen(false)
    setEditingEmployee(null)
    setFormData(emptyForm)
  }

  const toggleDay = (day) => {
    setFormData((currentData) => ({
      ...currentData,
      days: currentData.days.includes(day)
        ? currentData.days.filter((selectedDay) => selectedDay !== day)
        : [...currentData.days, day],
    }))
  }

  const handleSave = async (event) => {
    event.preventDefault()

    if (!formData.name.trim()) {
      setError('Please enter an employee name.')
      return
    }

    if (formData.days.length === 0) {
      setError('Select at least one scheduled day.')
      return
    }

    setIsSaving(true)
    setError('')

    try {
      const employeePayload = {
        name: formData.name.trim(),
        shift: formData.shift,
        days: formData.days,
      }

      const encryptedEmployee = await encryptEmployee(employeePayload)

      if (editingEmployee) {
        await updateDoc(doc(db, 'employees', editingEmployee.id), {
          ...encryptedEmployee,
          updatedAt: serverTimestamp(),
        })
      } else {
        await addDoc(collection(db, 'employees'), {
          ...encryptedEmployee,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      }

      closeModal()
    } catch (saveError) {
      console.error(saveError)
      setError('Could not save the employee. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const updateLocker = async (locker, updatedData) => {
    const encryptedLocker = await encryptEmployee(updatedData)

    await updateDoc(doc(db, 'lockers', locker.id), {
      ...encryptedLocker,
      updatedAt: serverTimestamp(),
    })
  }

  const handleDelete = async () => {
    if (!employeeToDelete || isUpdatingLocker) return

    setIsUpdatingLocker(true)

    try {
      const affectedLockers = lockers.filter(
        (locker) =>
          locker.dayEmployeeIds.includes(employeeToDelete.id) ||
          locker.nightEmployeeIds.includes(employeeToDelete.id)
      )

      await Promise.all(
        affectedLockers.map((locker) =>
          updateLocker(locker, {
            lockerNumber: locker.lockerNumber,
            combination: locker.combination,
            dayEmployeeIds: locker.dayEmployeeIds.filter(
              (employeeId) => employeeId !== employeeToDelete.id
            ),
            nightEmployeeIds: locker.nightEmployeeIds.filter(
              (employeeId) => employeeId !== employeeToDelete.id
            ),
          })
        )
      )

      await deleteDoc(doc(db, 'employees', employeeToDelete.id))

      if (selectedEmployeeId === employeeToDelete.id) {
        setSelectedEmployeeId(null)
      }

      setEmployeeToDelete(null)
    } catch (deleteError) {
      console.error(deleteError)
      setError(
        'Could not delete the employee or remove their RF locker assignment.'
      )
    } finally {
      setIsUpdatingLocker(false)
    }
  }

  const handleDragStart = (event, employeeId) => {
    event.dataTransfer.effectAllowed = 'move'
    setDraggedEmployeeId(employeeId)
  }

  const handleDragEnd = () => {
    setDraggedEmployeeId(null)
  }

  const handleLockerDrop = async (event, locker, assignmentField) => {
    event.preventDefault()

    if (!draggedEmployeeId || isUpdatingLocker) return

    const employee = employeeById(draggedEmployeeId)

    if (!employee) {
      setError('Employee information could not be found.')
      setDraggedEmployeeId(null)
      return
    }

    if (isReservedLocker(locker)) {
      setError(
        `${locker.lockerNumber} is reserved for ${
          RESERVED_LOCKERS[locker.lockerNumber]
        }.`
      )
      setDraggedEmployeeId(null)
      return
    }

    if (
      (employee.shift === 'Day' && assignmentField !== 'dayEmployeeIds') ||
      (employee.shift === 'Night' && assignmentField !== 'nightEmployeeIds')
    ) {
      setError(
        `${employee.name} is a ${employee.shift} Shift employee and can only be assigned to the ${employee.shift} User column.`
      )
      setDraggedEmployeeId(null)
      return
    }

    if (!lockerCanAcceptEmployee(locker, employee)) {
      setError(
        `${employee.name} cannot share ${locker.lockerNumber} because their scheduled days overlap with another assigned employee.`
      )
      setDraggedEmployeeId(null)
      return
    }

    setDraggedEmployeeId(null)
    setIsUpdatingLocker(true)
    setError('')

    try {
      const updatedLocker = {
        lockerNumber: locker.lockerNumber,
        combination: locker.combination,
        dayEmployeeIds:
          assignmentField === 'dayEmployeeIds'
            ? [...new Set([...locker.dayEmployeeIds, employee.id])]
            : locker.dayEmployeeIds,
        nightEmployeeIds:
          assignmentField === 'nightEmployeeIds'
            ? [...new Set([...locker.nightEmployeeIds, employee.id])]
            : locker.nightEmployeeIds,
      }

      await updateLocker(locker, updatedLocker)
    } catch (lockerError) {
      console.error(lockerError)
      setError('Could not assign the employee to this RF locker.')
    } finally {
      setIsUpdatingLocker(false)
    }
  }

  const removeLockerAssignment = async (
    locker,
    assignmentField,
    employeeId
  ) => {
    if (isUpdatingLocker) return

    setIsUpdatingLocker(true)

    try {
      const updatedLocker = {
        lockerNumber: locker.lockerNumber,
        combination: locker.combination,
        dayEmployeeIds:
          assignmentField === 'dayEmployeeIds'
            ? locker.dayEmployeeIds.filter((id) => id !== employeeId)
            : locker.dayEmployeeIds,
        nightEmployeeIds:
          assignmentField === 'nightEmployeeIds'
            ? locker.nightEmployeeIds.filter((id) => id !== employeeId)
            : locker.nightEmployeeIds,
      }

      await updateLocker(locker, updatedLocker)
    } catch (lockerError) {
      console.error(lockerError)
      setError('Could not remove the employee from this RF locker.')
    } finally {
      setIsUpdatingLocker(false)
    }
  }

  const renderLockerAssignmentCell = (locker, assignmentField) => {
    const employeeIds = locker[assignmentField] || []
    const reservedLabel = RESERVED_LOCKERS[locker.lockerNumber]

    if (reservedLabel) {
      return (
        <td className="locker-assignment-cell reserved-locker-cell">
          <span className="reserved-locker-label">{reservedLabel}</span>
        </td>
      )
    }

    return (
      <td
        className="locker-assignment-cell"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => handleLockerDrop(event, locker, assignmentField)}
      >
        {employeeIds.length > 0 ? (
          <div className="locker-assignment-list">
            {employeeIds.map((employeeId) => {
              const employee = employeeById(employeeId)

              return (
                <div className="locker-employee-pill" key={employeeId}>
                  <div className="locker-employee-information">
                    <strong>
                      {employee ? employee.name : 'Unknown employee'}
                    </strong>
                    <span>
                      {employee
                        ? formatDays(employee.days)
                        : 'Schedule unavailable'}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="remove-locker-user"
                    onClick={() =>
                      removeLockerAssignment(
                        locker,
                        assignmentField,
                        employeeId
                      )
                    }
                    aria-label={`Remove ${employeeNameById(
                      employeeId
                    )} from ${locker.lockerNumber}`}
                    disabled={isUpdatingLocker}
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <span className="locker-drop-placeholder">
            {isUpdatingLocker ? 'Saving...' : 'Drop employee here'}
          </span>
        )}
      </td>
    )
  }

  const renderLockerTable = () => (
    <section className="locker-assignment-panel">
      <div className="locker-table-header">
        <div>
          <h2>Locker Assignments</h2>
          <p>
            Drag an available employee into a Day User or Night User cell.
          </p>
        </div>

        <div className="locker-header-actions">
          <span className="locker-count">{lockers.length} lockers</span>

          <button
            className="secondary-button export-preview-button"
            type="button"
            onClick={() => setIsExportPreviewOpen(true)}
            disabled={lockers.length === 0}
          >
            Preview & Export
          </button>
        </div>
      </div>

      <div className="locker-table-wrapper">
        <table className="locker-table">
          <thead>
            <tr>
              <th>Locker #</th>
              <th>Lock Combination</th>
              <th>Day User</th>
              <th>Night User</th>
            </tr>
          </thead>

          <tbody>
            {lockers.length > 0 ? (
              lockers.map((locker) => (
                <tr key={locker.id}>
                  <td className="locker-number">{locker.lockerNumber}</td>
                  <td className="locker-combination">{locker.combination}</td>
                  {renderLockerAssignmentCell(locker, 'dayEmployeeIds')}
                  {renderLockerAssignmentCell(locker, 'nightEmployeeIds')}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" className="locker-table-empty">
                  No lockers found. Import the encrypted locker data first.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )

  const renderAvailableEmployeeTable = (title, employeeList) => (
    <section className="roster-shift-section">
      <div className="roster-shift-header">
        <h3>{title}</h3>
        <span>{employeeList.length}</span>
      </div>

      <div className="roster-table-wrapper">
        <table className="roster-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Schedule</th>
              <th className="roster-drag-column">Drag</th>
            </tr>
          </thead>

          <tbody>
            {employeeList.length > 0 ? (
              employeeList.map((employee) => {
                const isSelected = selectedEmployeeId === employee.id
                const suggestionText = getSuggestionText(employee)
                const suggestedLockers = getSuggestedLockers(employee)

                return (
                  <>
                    <tr
                      key={employee.id}
                      className={isSelected ? 'selected-employee-row' : ''}
                      draggable
                      title={suggestionText}
                      onClick={() =>
                        setSelectedEmployeeId(
                          isSelected ? null : employee.id
                        )
                      }
                      onDragStart={(event) =>
                        handleDragStart(event, employee.id)
                      }
                      onDragEnd={handleDragEnd}
                    >
                      <td className="roster-table-name">
                        <span className="table-avatar">
                          {employee.name.charAt(0).toUpperCase()}
                        </span>
                        {employee.name}
                      </td>

                      <td className="roster-schedule">
                        {formatDays(employee.days)}
                      </td>

                      <td className="roster-drag-cell">
                        <span className="drag-handle" aria-label="Drag employee">
                          ⠿
                        </span>
                      </td>
                    </tr>

                    {isSelected && (
                      <tr className="employee-suggestion-row">
                        <td colSpan="3">
                          <div className="employee-suggestions">
                            <strong>Suggested RF lockers</strong>

                            {suggestedLockers.length > 0 ? (
                              <div className="suggested-locker-list">
                                {suggestedLockers.map((locker) => (
                                  <span
                                    className="suggested-locker-badge"
                                    key={locker.id}
                                  >
                                    {locker.lockerNumber}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="no-suggestion-text">
                                No compatible RF lockers available.
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })
            ) : (
              <tr>
                <td colSpan="3" className="roster-table-empty">
                  No available employees.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )

  const renderEmployeeTable = (title, employeeList, shift) => (
    <section className="shift-card">
      <div className="table-header">
        <div>
          <p className="eyebrow">Employees</p>
          <h2>{title}</h2>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={() => openAddModal(shift)}
        >
          + Add employee
        </button>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Shift</th>
              <th className="actions-column">Actions</th>
            </tr>
          </thead>

          <tbody>
            {employeeList.length > 0 ? (
              employeeList.map((employee) => (
                <tr key={employee.id}>
                  <td className="employee-name">{employee.name}</td>
                  <td>{formatDays(employee.days)}</td>
                  <td className="table-actions">
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => openEditModal(employee)}
                    >
                      Edit
                    </button>

                    <button
                      className="text-button delete-button"
                      type="button"
                      onClick={() => setEmployeeToDelete(employee)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="3" className="empty-state">
                  No employees added to this shift yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )

  return (
    <main className="app-shell">
      <div className="app-container">
        <div className="app-layout">
          <aside className="app-sidebar">
            <header className="app-header">
              <div className="brand">
                <h1>Voila</h1>
                <p>Dispatch RF Tracker</p>
              </div>
            </header>

            <nav className="tabs" aria-label="RF Tracker sections">
              <button
                className={`tab-button ${
                  activeTab === 'rfs' ? 'active' : ''
                }`}
                type="button"
                onClick={() => setActiveTab('rfs')}
              >
                <span className="tab-icon">◫</span>
                RFs
              </button>

              <button
                className={`tab-button ${
                  activeTab === 'employees' ? 'active' : ''
                }`}
                type="button"
                onClick={() => setActiveTab('employees')}
              >
                <span className="tab-icon">◉</span>
                Employees
              </button>
            </nav>
          </aside>

          <section className="main-content">
            {error && (
              <div className="error-message" role="alert">
                {error}
              </div>
            )}

            {activeTab === 'rfs' ? (
              <section className="rf-dashboard">
                {renderLockerTable()}

                <aside className="rf-employee-roster">
                  <div className="roster-header">
                    <div>
                      <h2>Available Employees</h2>
                    </div>

                    <span className="roster-count">
                      {availableEmployees.length}
                    </span>
                  </div>

                  <p className="roster-description">
                    Click an employee to view suggested lockers, then drag them
                    to a compatible RF locker assignment cell.
                  </p>

                  <div className="roster-list roster-table-list">
                    {renderAvailableEmployeeTable(
                      'Day Shift',
                      availableDayEmployees
                    )}

                    {renderAvailableEmployeeTable(
                      'Night Shift',
                      availableNightEmployees
                    )}
                  </div>
                </aside>
              </section>
            ) : (
              <section className="employees-section">
                <div className="page-heading">
                  <div>
                    <h2>Employees</h2>
                  </div>
                </div>

                {loading ? (
                  <div className="loading-card">Loading employee data...</div>
                ) : (
                  <div className="shift-grid">
                    {renderEmployeeTable(
                      'Day Shift',
                      dayShiftEmployees,
                      'Day'
                    )}

                    {renderEmployeeTable(
                      'Night Shift',
                      nightShiftEmployees,
                      'Night'
                    )}
                  </div>
                )}
              </section>
            )}
          </section>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-backdrop" onMouseDown={closeModal}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">
                  {editingEmployee ? 'Update employee' : 'New employee'}
                </p>

                <h2 id="employee-modal-title">
                  {editingEmployee ? 'Edit employee' : 'Add employee'}
                </h2>
              </div>

              <button
                className="close-button"
                type="button"
                onClick={closeModal}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSave}>
              <label className="form-label" htmlFor="employee-name">
                Name
              </label>

              <input
                id="employee-name"
                className="text-input"
                type="text"
                value={formData.name}
                placeholder="Enter employee name"
                onChange={(event) =>
                  setFormData((currentData) => ({
                    ...currentData,
                    name: event.target.value,
                  }))
                }
                autoFocus
              />

              <span className="form-label">Shift type</span>

              <div className="shift-options">
                {['Day', 'Night'].map((shift) => (
                  <label
                    className={`shift-option ${
                      formData.shift === shift ? 'selected' : ''
                    }`}
                    key={shift}
                  >
                    <input
                      type="radio"
                      name="shift"
                      value={shift}
                      checked={formData.shift === shift}
                      onChange={(event) =>
                        setFormData((currentData) => ({
                          ...currentData,
                          shift: event.target.value,
                        }))
                      }
                    />
                    {shift} Shift
                  </label>
                ))}
              </div>

              <span className="form-label">Scheduled days</span>

              <div className="days-grid">
                {DAYS.map((day) => (
                  <label className="day-checkbox" key={day.label}>
                    <input
                      type="checkbox"
                      checked={formData.days.includes(day.label)}
                      onChange={() => toggleDay(day.label)}
                    />
                    <span>{day.abbreviation}</span>
                  </label>
                ))}
              </div>

              <div className="modal-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={closeModal}
                  disabled={isSaving}
                >
                  Cancel
                </button>

                <button
                  className="primary-button"
                  type="submit"
                  disabled={isSaving}
                >
                  {isSaving
                    ? 'Saving...'
                    : editingEmployee
                      ? 'Save changes'
                      : 'Add employee'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {employeeToDelete && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setEmployeeToDelete(null)}
        >
          <section
            className="modal delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="delete-icon">!</div>

            <h2 id="delete-modal-title">Delete employee?</h2>

            <p className="delete-message">
              Are you sure you want to delete{' '}
              <strong>{employeeToDelete.name}</strong> from the{' '}
              {employeeToDelete.shift} Shift? This action cannot be undone.
            </p>

            <div className="modal-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setEmployeeToDelete(null)}
              >
                Cancel
              </button>

              <button
                className="danger-button"
                type="button"
                onClick={handleDelete}
              >
                Delete employee
              </button>
            </div>
          </section>
        </div>
      )}

      {isExportPreviewOpen && (
        <LockerExportModal
          lockers={lockers}
          employees={employees}
          onClose={() => setIsExportPreviewOpen(false)}
        />
      )}
    </main>
  )
}

export default App