import React, { useState, useEffect } from 'react';
import { 
    Dialog, DialogTitle, DialogContent, DialogActions, 
    TextField, Button, Box, Typography, Alert
} from '@mui/material';

export default function DirectoryModal({ open, onClose, onCreated }) {
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    // Auto-generate slug from name
    useEffect(() => {
        if (name) {
            const generated = name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)+/g, '');
            setSlug(generated);
        } else {
            setSlug('');
        }
    }, [name]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name || !slug) return;

        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch('/api/file-management/directories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, slug, description })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'Failed to create directory');
            }

            onCreated(data); // pass back the created data
        } catch (err) {
            console.error('Error creating directory:', err);
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <form onSubmit={handleSubmit}>
                <DialogTitle sx={{ backgroundColor: '#830001', color: 'white' }}>
                    Create New Directory
                </DialogTitle>
                <DialogContent sx={{ mt: 2 }}>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                    
                    <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
                        This represents a dedicated S3 storage directory for organizing uploaded files.
                    </Typography>

                    <TextField
                        autoFocus
                        margin="dense"
                        label="Directory Name"
                        type="text"
                        fullWidth
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Seating Arrangement"
                    />

                    <TextField
                        margin="dense"
                        label="Description (Optional)"
                        type="text"
                        fullWidth
                        multiline
                        rows={2}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        sx={{ mt: 2 }}
                    />

                    <Box sx={{ mt: 3, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                        <Typography variant="caption" color="textSecondary">
                            Generated S3 Prefix Preview:
                        </Typography>
                        <Typography variant="body1" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
                            notices/{slug || '<generated-slug>'}/
                        </Typography>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2, bgcolor: '#fafafa' }}>
                    <Button onClick={onClose} disabled={submitting}>Cancel</Button>
                    <Button 
                        type="submit" 
                        variant="contained" 
                        disabled={submitting || !name || !slug}
                        sx={{ backgroundColor: '#830001', '&:hover': { backgroundColor: '#6a0001' } }}
                    >
                        {submitting ? 'Creating...' : 'Create Directory'}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}
