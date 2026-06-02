'use client'

import React, { useState, useEffect } from 'react'
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  IconButton,
    Button,
  CircularProgress,
  TextField,
  Box,
    Typography,
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import { AddFaculty } from './faculty-management-props/addfaculty'
import { EditFaculty } from './faculty-management-props/editfaculty'
import { ConfirmDelete } from './faculty-management-props/confirm-delete'
import Loading from './common/Loading'

const columns = [
  { id: 'name', label: 'Name', minWidth: 170 },
  { id: 'email', label: 'Email', minWidth: 200 },
  { id: 'department', label: 'Department', minWidth: 170 },
  { id: 'designation', label: 'Designation', minWidth: 170 },
  { id: 'academic_responsibility', label: 'Academic Responsibility', minWidth: 180 },
  { id: 'role', label: 'Role', minWidth: 150 },
  { id: 'status', label: 'Status', minWidth: 120 },
  { id: 'actions', label: 'Actions', minWidth: 120 },
]

export function FacultyTable() {
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [openAdd, setOpenAdd] = useState(false)
  const [openEdit, setOpenEdit] = useState(false)
  const [openDelete, setOpenDelete] = useState(false)
  const [selectedFaculty, setSelectedFaculty] = useState(null)
  const [facultyToDelete, setFacultyToDelete] = useState(null)
  const [nameSearch, setNameSearch] = useState('')
  const [emailSearch, setEmailSearch] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [searchTimeout, setSearchTimeout] = useState(null)

  // Fetch faculty data function
  const fetchFaculty = async (targetPage = page, targetRowsPerPage = rowsPerPage) => {
    try {
      setLoading(true)
      const res = await fetch(`/api/faculty?type=all&page=${targetPage + 1}&limit=${targetRowsPerPage}&name=${nameSearch}&email=${emailSearch}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setRows(Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []))
      setTotal(Number(data?.total) || 0)
    } catch (error) {
      console.error('Error fetching faculty:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch faculty data when pagination changes
  useEffect(() => {
    fetchFaculty()
  }, [page, rowsPerPage,nameSearch,emailSearch])

    const handleChangePage = (event, newPage) => {
        setPage(newPage)
    }

    const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(+event.target.value)
        setPage(0)
    }

  const handleEdit = async (faculty) => {
    try {
      // Fetch complete faculty data
      const res = await fetch(`/api/faculty?type=${faculty.email}`)
      const fullFacultyData = await res.json()
      
      console.log("Full faculty data:", fullFacultyData) // Debug log
      setSelectedFaculty(fullFacultyData)
      setOpenEdit(true)
    } catch (error) {
      console.error('Error fetching faculty details:', error)
      alert('Failed to load faculty details')
    }
  }

  const handleDelete = async (facultyRow) => {
    try {
      // Fetch complete faculty data for the delete confirmation
      const res = await fetch(`/api/faculty?type=${facultyRow.email}`)
      const fullFacultyData = await res.json()
      
      setFacultyToDelete(fullFacultyData)
      setOpenDelete(true)
    } catch (error) {
      console.error('Error fetching faculty details:', error)
      // Fallback: create basic faculty object from row data
      const facultyData = {
        profile: {
          name: facultyRow.name,
          email: facultyRow.email,
          department: facultyRow.department,
          designation: facultyRow.designation,
          role: facultyRow.role,
          ext_no: facultyRow.ext_no,
          research_interest: facultyRow.research_interest,
          academic_responsibility: facultyRow.academic_responsibility,
          is_retired: facultyRow.is_retired,
          retirement_date: facultyRow.retirement_date,
          image: facultyRow.image
        }
      }
      setFacultyToDelete(facultyData)
      setOpenDelete(true)
    }
  }

  const handleDeleteFromEdit = (faculty) => {
    setFacultyToDelete(faculty)
    setOpenEdit(false)
    setOpenDelete(true)
  }
  useEffect(() => {
    setPage(0)
  }, [nameSearch, emailSearch])

  const formatDate = (dateValue) => {
    if (!dateValue) return ''
    try {
      const d = new Date(dateValue)
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
    } catch (e) {
      // fallthrough to fallback
    }
    if (typeof dateValue === 'string' && dateValue.includes('T')) return dateValue.split('T')[0]
    return String(dateValue)
  }


  return (
    <Paper sx={{ width: '100%', overflow: 'hidden', p: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" component="h2" sx={{ mb: 2 }}>
          Faculty Management
                    </Typography>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          {loading && <Loading/>}
          <TextField
            label="Search by Name"
            variant="outlined"
            size="small"
            value={nameInput}
            onChange={(e) => {
              const value = e.target.value

              setNameInput(value)
              if (searchTimeout) {
                clearTimeout(searchTimeout)
              }

              const timeout = setTimeout(() => {
                setNameSearch(value)
              }, 1000)
              setSearchTimeout(timeout)
            }}

            sx={{ flexGrow: 1 }}
            InputProps={{
              startAdornment: <SearchIcon sx={{ color: 'action.active', mr: 1 }} />,
            }}
          />
                        <TextField
            label="Search by Email"
                            variant="outlined"
                            size="small"
            value={emailInput}
            onChange={(e) => {
              const value = e.target.value

              setEmailInput(value)
              if (searchTimeout) {
                clearTimeout(searchTimeout)
              }

              const timeout = setTimeout(() => {
                setEmailSearch(value)
              }, 1000)

              setSearchTimeout(timeout)
            }}
            sx={{ flexGrow: 1 }}
            InputProps={{
              startAdornment: <SearchIcon sx={{ color: 'action.active', mr: 1 }} />,
            }}
                        />
                        <Button
                            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setOpenAdd(true)}
            style={{ backgroundColor: '#830001', color: 'white' }}
                        >
            Add Faculty
                        </Button>
        </Box>
      </Box>

      <TableContainer sx={{ maxHeight: 'calc(100vh - 300px)' }}>
        <Table stickyHeader aria-label="sticky table">
                    <TableHead>
                        <TableRow>
              {columns.map((column) => (
                <TableCell
                  key={column.id}
                  style={{ minWidth: column.minWidth, fontWeight: 'bold' }}
                >
                  {column.label}
                </TableCell>
              ))}
                        </TableRow>
                    </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow hover tabIndex={-1} key={row.email}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.email}</TableCell>
                  <TableCell>{row.department}</TableCell>
                  <TableCell>{row.designation || 'N/A'}</TableCell>
                  <TableCell>{row.academic_responsibility || 'N/A'}</TableCell>
                  <TableCell>{row.role}</TableCell>
                  <TableCell>
                    {row.is_retired ? (
                      <span className="text-red-600  font-semibold">
                        Retired<br />
                        <span>{formatDate(row.retirement_date)}</span>
                      </span>
                    ) : (
                      <span className="text-green-500  rounded-full font-semibold">
                        Active
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <IconButton 
                      onClick={() => handleEdit(row)}
                      color="primary"
                      size="small"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton 
                      onClick={() => handleDelete(row)}
                      color="error"
                      size="small"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                    </TableRow>
              ))}
                    </TableBody>
        </Table>
      </TableContainer>
                            <TablePagination
        rowsPerPageOptions={[10, 25, 50]}
        component="div"
                              count={total}
                                rowsPerPage={rowsPerPage}
                                page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />

      <AddFaculty
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        onSuccess={(newFaculty) => {
          setRows(prev => [...prev, newFaculty])
          setOpenAdd(false)
        }}
      />

      {selectedFaculty && openEdit && (
        <EditFaculty
          open={openEdit}
          faculty={selectedFaculty}
          onClose={() => {
            setOpenEdit(false)
            setSelectedFaculty(null)
          }}
          onSuccess={(updatedFaculty) => {
            setRows(prev => 
              prev.map(row => 
                row.email === updatedFaculty.email ? updatedFaculty : row
              )
            )
            setOpenEdit(false)
            setSelectedFaculty(null)
          }}
          onDelete={handleDeleteFromEdit}
        />
      )}

      {openDelete && facultyToDelete && (
        <ConfirmDelete
          open={openDelete}
          onClose={() => {
            setOpenDelete(false)
            setFacultyToDelete(null)
          }}
          faculty={facultyToDelete}
          refreshTable={fetchFaculty}
        />
      )}
    </Paper>
    )
}
