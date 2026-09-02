import { 
    Button, 
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Alert,
    Box,
    TextField,
    MenuItem,
    Grid
} from '@mui/material'
import { useSession } from 'next-auth/react'
import React, { useEffect, useState } from 'react'
import { useFacultyData } from '../../../context/FacultyDataContext'

const formatDateForInput = (dateVal) => {
    if (!dateVal) return ''
    if (typeof dateVal === 'string' && dateVal.includes('T')) return dateVal.split('T')[0]
    if (typeof dateVal === 'number') return new Date(dateVal).toISOString().slice(0, 10)
    return dateVal
}

export const EditProfile = ({ handleClose, modal, currentProfile, onUpdate }) => {
    const { data: session } = useSession()
    const { updateFacultySection } = useFacultyData()
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')
    const [formData, setFormData] = useState({
        research_interest: currentProfile?.research_interest || '',
        ext_no: currentProfile?.ext_no || '',
        category: currentProfile?.category || '',
        gender: currentProfile?.gender || '',
        date_of_birth: formatDateForInput(currentProfile?.date_of_birth),
        date_of_joining: formatDateForInput(currentProfile?.date_of_joining),
        linkedin: currentProfile?.linkedin || '',
        google_scholar: currentProfile?.google_scholar || '',
        personal_webpage: currentProfile?.personal_webpage || '',
        scopus: currentProfile?.scopus || '',
        vidwan: currentProfile?.vidwan || '',
        orcid: currentProfile?.orcid || ''
    })

    useEffect(() => {
        if (!modal) return

        setFormData({
            research_interest: currentProfile?.research_interest || '',
            ext_no: currentProfile?.ext_no || '',
            category: currentProfile?.category || '',
            gender: currentProfile?.gender || '',
            date_of_birth: formatDateForInput(currentProfile?.date_of_birth),
            date_of_joining: formatDateForInput(currentProfile?.date_of_joining),
            linkedin: currentProfile?.linkedin || '',
            google_scholar: currentProfile?.google_scholar || '',
            personal_webpage: currentProfile?.personal_webpage || '',
            scopus: currentProfile?.scopus || '',
            vidwan: currentProfile?.vidwan || '',
            orcid: currentProfile?.orcid || ''
        })
        setError('')
    }, [modal, currentProfile])

    const handleChange = (e) => {
        const { name, value } = e.target
        setFormData(prev => ({
            ...prev,
            [name]: value
        }))
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setSubmitting(true)
        setError('')

        if (!formData.date_of_birth || !formData.date_of_joining || !formData.category || !formData.gender) {
            setError('Date of Birth, Date of Joining, Category, and Gender are mandatory fields.')
            setSubmitting(false)
            return
        }

        try {
            const response = await fetch('/api/update', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    type: 'profile',
                    email: session.user.email,
                    ...formData
                }),
            })

            if (!response.ok) {
                const resData = await response.json().catch(() => ({}))
                throw new Error(resData.message || 'Failed to update profile')
            }
            
            // Update the faculty data context with new profile data
            updateFacultySection('profile', formData)
            
            // Update parent component if callback provided
            if (onUpdate) {
                onUpdate(formData)
            }

            handleClose()
        } catch (error) {
            console.error('Error:', error)
            setError(error.message || 'Failed to update profile')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog open={modal} onClose={handleClose} maxWidth="md" fullWidth>
            <form onSubmit={handleSubmit}>
                <DialogTitle>Edit Profile Details</DialogTitle>
                <DialogContent>
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Research Interest"
                                name="research_interest"
                                value={formData.research_interest}
                                onChange={handleChange}
                                multiline
                                rows={3}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Phone Number"
                                name="ext_no"
                                value={formData.ext_no}
                                onChange={handleChange}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                type="date"
                                label="Date of Birth"
                                name="date_of_birth"
                                required
                                InputLabelProps={{ shrink: true }}
                                value={formData.date_of_birth}
                                onChange={handleChange}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                type="date"
                                label="Date of Joining"
                                name="date_of_joining"
                                required
                                InputLabelProps={{ shrink: true }}
                                value={formData.date_of_joining}
                                onChange={handleChange}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                select
                                label="Category"
                                name="category"
                                required
                                value={formData.category}
                                onChange={handleChange}
                            >
                                <MenuItem value="GEN">General</MenuItem>
                                <MenuItem value="OBC">OBC</MenuItem>
                                <MenuItem value="SC">SC</MenuItem>
                                <MenuItem value="ST">ST</MenuItem>
                            </TextField>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                select
                                label="Gender"
                                name="gender"
                                required
                                value={formData.gender}
                                onChange={handleChange}
                            >
                                <MenuItem value="MALE">Male</MenuItem>
                                <MenuItem value="FEMALE">Female</MenuItem>
                                <MenuItem value="OTHER">Other</MenuItem>
                            </TextField>
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="LinkedIn Profile"
                                name="linkedin"
                                value={formData.linkedin}
                                onChange={handleChange}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Google Scholar"
                                name="google_scholar"
                                value={formData.google_scholar}
                                onChange={handleChange}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Personal Webpage"
                                name="personal_webpage"
                                value={formData.personal_webpage}
                                onChange={handleChange}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Scopus"
                                name="scopus"
                                value={formData.scopus}
                                onChange={handleChange}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Vidwan"
                                name="vidwan"
                                value={formData.vidwan}
                                onChange={handleChange}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="ORCID"
                                name="orcid"
                                value={formData.orcid}
                                onChange={handleChange}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleClose}>Cancel</Button>
                    <Button
                        type="submit"
                        variant="contained"
                        disabled={submitting}
                    >
                        {submitting ? 'Saving...' : 'Save Changes'}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    )
} 