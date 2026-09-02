import React, { useState } from 'react';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    CircularProgress,
    Box,
    Typography,
    Alert,
    Chip
} from '@mui/material';
import { Warning, Delete } from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { extractS3KeyFromUrl, deleteS3File } from '@/lib/utils';

export const ConfirmDelete = ({ open, handleClose, notice }) => {
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleConfirmDelete = async () => {
        setLoading(true);
        try {
            console.log(`[Notice Delete] Starting deletion process for notice ID: ${notice.id}`);
            
            // Step 1: Extract and delete all attachments from S3
            let attachmentsData = [];
            if (notice?.attachments) {
                try {
                    // Parse attachments if they're stored as a string
                    if (typeof notice.attachments === 'string') {
                        attachmentsData = JSON.parse(notice.attachments);
                    } else {
                        attachmentsData = notice.attachments;
                    }
                    
                    console.log(`[Notice Delete] Found ${attachmentsData.length} attachments to delete`);
                    
                    // Delete each attachment from S3
                    if (Array.isArray(attachmentsData) && attachmentsData.length > 0) {
                        for (const attachment of attachmentsData) {
                            let keyToDelete = null;
                            
                            // Case 1: Attachment has explicit key
                            if (attachment.key) {
                                keyToDelete = attachment.key;
                                console.log(`[Notice Delete] Found explicit key: ${keyToDelete}`);
                            } 
                            // Case 2: Extract key from URL
                            else if (attachment.url && typeof attachment.url === 'string' && attachment.url.includes('.amazonaws.com')) {
                                keyToDelete = extractS3KeyFromUrl(attachment.url);
                                console.log(`[Notice Delete] Extracted key from URL: ${keyToDelete}`);
                            }
                            
                            if (keyToDelete) {
                                console.log(`[Notice Delete] Deleting attachment with key: ${keyToDelete}`);
                                await deleteS3File(keyToDelete);
                            }
                        }
                    }
                } catch (error) {
                    console.error('[Notice Delete] Error processing attachments:', error);
                    // Continue with deletion even if attachment processing fails
                }
            }
            
            // Step 2: Delete the notice from the database
            console.log(`[Notice Delete] Deleting notice record from database, ID: ${notice.id}`);
            const response = await fetch('/api/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    type: 'notice',
                    id: notice.id
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to delete notice');
            }

            const data = await response.json();
            console.log('[Notice Delete] Database deletion response:', data);
            
            handleClose();
            // Force a full page reload to ensure the deleted notice is removed from the UI
            window.location.reload();
        } catch (error) {
            console.error('[Notice Delete] Error deleting notice:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            aria-labelledby="alert-dialog-title"
            aria-describedby="alert-dialog-description"
            maxWidth="sm"
            fullWidth
        >
            <DialogTitle 
                id="alert-dialog-title"
                sx={{ 
                    backgroundColor: '#d32f2f', 
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    position: 'sticky',
                    top: 0,
                    zIndex: 1300
                }}
            >
                <Warning />
                Confirm Delete
            </DialogTitle>
            <DialogContent sx={{ 
                mt: 2, 
                maxHeight: '60vh', 
                overflowY: 'auto',
                '&::-webkit-scrollbar': {
                    display: 'none'
                },
                scrollbarWidth: 'none',  // Firefox
                msOverflowStyle: 'none'  // IE and Edge
            }}>
                <Alert severity="error" sx={{ mb: 2 }}>
                    This action cannot be undone!
                </Alert>
                
                <Box sx={{ mb: 2 }}>
                    <Typography variant="h6" sx={{ mb: 1, fontWeight: 500 }}>
                        Notice to be deleted:
                    </Typography>
                    <Typography 
                        variant="body1" 
                        sx={{ 
                            p: 2, 
                            backgroundColor: '#f5f5f5', 
                            borderRadius: 1,
                            fontStyle: 'italic'
                        }}
                    >
                        "{notice?.title}{notice?.additional_title ? ` (${notice?.additional_title})` : ''}"
                    </Typography>
                </Box>

                {notice?.attachments && notice.attachments.length > 0 && (
                    <Box sx={{ mb: 2 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            The following will also be permanently deleted:
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            <Chip 
                                label={`${notice.attachments.length} attachment(s)`}
                                color="warning"
                                size="small"
                            />
                        </Box>
                    </Box>
                )}

                <DialogContentText id="alert-dialog-description">
                    Are you sure you want to delete this notice? All associated files will also be permanently removed.
                </DialogContentText>
            </DialogContent>
            <DialogActions sx={{ p: 3, backgroundColor: '#f8f9fa', position: 'sticky', bottom: 0, zIndex: 1300 }}>
                <Button 
                    onClick={handleClose}
                    variant="outlined"
                    sx={{ 
                        color: '#666', 
                        borderColor: '#ddd',
                        '&:hover': {
                            backgroundColor: '#f5f5f5'
                        }
                    }}
                >
                    Cancel
                </Button>
                <Button
                    onClick={handleConfirmDelete}
                    variant="contained"
                    color="error"
                    autoFocus
                    disabled={loading}
                    startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <Delete />}
                    sx={{
                        minWidth: 120,
                        '&:hover': {
                            backgroundColor: '#b71c1c'
                        }
                    }}
                >
                    {loading ? 'Deleting...' : 'Delete Notice'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
