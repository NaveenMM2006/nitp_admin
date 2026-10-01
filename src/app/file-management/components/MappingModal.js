import React, { useState, useEffect } from 'react';
import { 
    Dialog, DialogTitle, DialogContent, DialogActions, 
    Button, Box, Typography, Select, MenuItem, FormControl, InputLabel,
    List, ListItem, ListItemText, IconButton, Divider, CircularProgress, Alert
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import { administrationList, notice_sub_types } from '@/lib/const';

export default function MappingModal({ open, onClose, directory, mappings, onMappingsUpdated }) {
    const [noticeType, setNoticeType] = useState('');
    const [subType, setSubType] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const availableSubTypes = noticeType && notice_sub_types[noticeType.toUpperCase()] 
        ? notice_sub_types[noticeType.toUpperCase()] 
        : null;

    // Reset subtype when type changes
    useEffect(() => {
        setSubType('');
    }, [noticeType]);

    const handleAddMapping = async () => {
        if (!noticeType) return;
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch('/api/file-management/mappings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    directory_id: directory.id,
                    notice_type: noticeType,
                    notice_sub_type: subType || null
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Failed to add mapping');
            
            // Reset form and refresh
            setNoticeType('');
            setSubType('');
            onMappingsUpdated();
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteMapping = async (id) => {
        if (!window.confirm('Remove this mapping?')) return;
        setSubmitting(true);
        try {
            const res = await fetch(`/api/file-management/mappings?id=${id}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error('Failed to delete mapping');
            onMappingsUpdated();
        } catch (err) {
            alert('Error deleting mapping: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ backgroundColor: '#f5f5f5' }}>
                Manage Notice Mappings
            </DialogTitle>
            <DialogContent sx={{ mt: 2 }}>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                    Map this directory to specific Notice Types. When a user creates a notice of this type, this directory will be available for S3 uploads.
                </Typography>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                <Box display="flex" gap={2} mb={3}>
                    <FormControl fullWidth size="small">
                        <InputLabel>Notice Type</InputLabel>
                        <Select
                            value={noticeType}
                            label="Notice Type"
                            onChange={(e) => setNoticeType(e.target.value)}
                        >
                            <MenuItem value="General">General</MenuItem>
                            <MenuItem value="Department">Department</MenuItem>
                            <MenuItem value="Academics">Academics</MenuItem>
                            <MenuItem value="Tender">Tender</MenuItem>
                            {Array.from(administrationList).map(([key, value]) => (
                                <MenuItem key={key} value={key}>{value}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <FormControl fullWidth size="small" disabled={!availableSubTypes}>
                        <InputLabel>Sub Type (Optional)</InputLabel>
                        <Select
                            value={subType}
                            label="Sub Type (Optional)"
                            onChange={(e) => setSubType(e.target.value)}
                        >
                            <MenuItem value=""><em>All SubTypes</em></MenuItem>
                            {availableSubTypes && availableSubTypes.map(([displayName, upKey]) => (
                                <MenuItem key={upKey} value={upKey}>{upKey}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <Button 
                        variant="contained" 
                        onClick={handleAddMapping} 
                        disabled={!noticeType || submitting}
                        sx={{ whiteSpace: 'nowrap', backgroundColor: '#830001', '&:hover': { backgroundColor: '#6a0001' } }}
                    >
                        Add
                    </Button>
                </Box>

                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                    Current Mappings:
                </Typography>
                
                {mappings.length === 0 ? (
                    <Typography variant="body2" color="textSecondary" sx={{ fontStyle: 'italic' }}>
                        No mappings found. This directory won't appear dynamically in the notice form unless it is the Default directory.
                    </Typography>
                ) : (
                    <List dense sx={{ bgcolor: '#fafafa', borderRadius: 1 }}>
                        {mappings.map(m => (
                            <React.Fragment key={m.id}>
                                <ListItem
                                    secondaryAction={
                                        <IconButton edge="end" size="small" color="error" onClick={() => handleDeleteMapping(m.id)} disabled={submitting}>
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    }
                                >
                                    <ListItemText 
                                        primary={m.notice_type} 
                                        secondary={m.notice_sub_type ? `SubType: ${m.notice_sub_type}` : 'All SubTypes'}
                                    />
                                </ListItem>
                                <Divider component="li" />
                            </React.Fragment>
                        ))}
                    </List>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={submitting}>Done</Button>
            </DialogActions>
        </Dialog>
    );
}
