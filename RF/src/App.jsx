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

const emptyForm = {
  name: '',
  shift: 'Day',
  days: [],
}

function App() {
  const [activeTab, setActiveTab] = useState('rfs')
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [isSaving, setIsSaving] = useState(false)
  const [employeeToDelete, setEmployeeToDelete] = useState(null)
  const [draggedEmployeeId, setDraggedEmployeeId] = useState(null)
  const [rfAssignments, setRfAssignments] = useState([])

  useEffect(() => {
    let unsubscribe = () => {}

    const startApp = async () => {
      try {
        if (!auth.currentUser) {
          await signInAnonymously(auth)
        }

        unsubscribe = onSnapshot(
          collection(db, 'employees'),
          async (snapshot) => {
            try {
              const decryptedEmployees = await Promise.all(
                snapshot.docs.map(async (employeeDoc) => {
                  const decrypted = await decryptEmployee(employeeDoc.data())

                  return {
                    id: employeeDoc.id,
                    ...decrypted,
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
            setError(
              'Unable to access Firestore. Confirm Anonymous Authentication is enabled and your Firestore rules are published.'
            )
            setLoading(false)
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

    return () => unsubscribe()
  }, [])

  const dayShiftEmployees = useMemo(
    () => employees.filter((employee) => employee.shift === 'Day'),
    [employees]
  )

  const nightShiftEmployees = useMemo(
    () => employees.filter((employee) => employee.shift === 'Night'),
    [employees]
  )

  const assignedEmployees = employees.filter((employee) =>
    rfAssignments.includes(employee.id)
  )

  const availableEmployees = employees.filter(
  (employee) => !rfAssignments.includes(employee.id)
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

  const handleDelete = async () => {
    if (!employeeToDelete) return

    try {
      await deleteDoc(doc(db, 'employees', employeeToDelete.id))

      setRfAssignments((currentAssignments) =>
        currentAssignments.filter((id) => id !== employeeToDelete.id)
      )

      setEmployeeToDelete(null)
    } catch (deleteError) {
      console.error(deleteError)
      setError('Could not delete the employee. Please try again.')
    }
  }

  const handleDragStart = (event, employeeId) => {
    event.dataTransfer.effectAllowed = 'move'
    setDraggedEmployeeId(employeeId)
  }

  const handleDragEnd = () => {
    setDraggedEmployeeId(null)
  }

  const handleAssignmentDrop = (event) => {
    event.preventDefault()

    if (!draggedEmployeeId) return

    setRfAssignments((currentAssignments) => {
      if (currentAssignments.includes(draggedEmployeeId)) {
        return currentAssignments
      }

      return [...currentAssignments, draggedEmployeeId]
    })

    setDraggedEmployeeId(null)
  }

  const handleRosterDrop = (event) => {
    event.preventDefault()

    if (!draggedEmployeeId) return

    setRfAssignments((currentAssignments) =>
      currentAssignments.filter((employeeId) => employeeId !== draggedEmployeeId)
    )

    setDraggedEmployeeId(null)
  }

  const removeAssignment = (employeeId) => {
    setRfAssignments((currentAssignments) =>
      currentAssignments.filter((id) => id !== employeeId)
    )
  }

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
            employeeList.map((employee) => (
              <tr
                key={employee.id}
                draggable
                onDragStart={(event) => handleDragStart(event, employee.id)}
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
            ))
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
                <div
                  className="rf-workspace"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleAssignmentDrop}
                >
                  <div className="rf-workspace-header">
                    <div>
                      <p className="eyebrow">Scanner management</p>
                      <h2>RF Assignment Board</h2>
                      <p>
                        Drag employees from the roster into this area to prepare
                        RF assignments.
                      </p>
                    </div>

                    <div className="rf-count">
                      {assignedEmployees.length} assigned
                    </div>
                  </div>

                  <div className="rf-drop-zone">
                    {assignedEmployees.length > 0 ? (
                      <div className="assigned-employees-grid">
                        {assignedEmployees.map((employee) => (
                          <article
                            className="assigned-employee-card"
                            key={employee.id}
                            draggable
                            onDragStart={(event) =>
                              handleDragStart(event, employee.id)
                            }
                            onDragEnd={handleDragEnd}
                          >
                            <div className="employee-avatar">
                              {employee.name.charAt(0).toUpperCase()}
                            </div>

                            <div className="assigned-employee-details">
                              <strong>{employee.name}</strong>
                              <span>
                                {employee.shift} Shift ·{' '}
                                {formatDays(employee.days)}
                              </span>
                            </div>

                            <button
                              className="remove-assignment-button"
                              type="button"
                              onClick={() => removeAssignment(employee.id)}
                              aria-label={`Remove ${employee.name} from RF assignments`}
                            >
                              ×
                            </button>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="rf-empty-drop-zone">
                        <div className="rf-drop-icon">↓</div>
                        <h3>Drop employees here</h3>
                        <p>
                          Drag an employee from Available Employees to start
                          preparing RF assignments.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="rf-coming-soon-note">
                    <span>RF functionality is coming next</span>
                    Scanner assignment and activity tracking will be added here.
                  </div>
                </div>

                <aside
                  className="rf-employee-roster"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleRosterDrop}
                >
                  <div className="roster-header">
                    <div>
                      <h2>Available Employees</h2>
                    </div>

                    <span className="roster-count">{availableEmployees.length}</span>
                  </div>

                  <p className="roster-description">
                    Drag an employee into the assignment board. Drop an assigned employee
                    back in this area to make them available again.
                  </p>

                  <div className="roster-list roster-table-list">
                    {renderAvailableEmployeeTable('Day Shift', availableDayEmployees)}
                    {renderAvailableEmployeeTable('Night Shift', availableNightEmployees)}
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
    </main>
  )
}

export default App