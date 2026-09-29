import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Button, Paper, IconButton, Chip, 
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    TablePagination, TextField, InputAdornment, Tooltip, CircularProgress,
    Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText,
    Alert, Checkbox, Select, MenuItem, FormControl, InputLabel, Stack
} from '@mui/material';
import { 
    ArrowBack as ArrowBackIcon, 
    Search as SearchIcon,
    Visibility as VisibilityIcon,
    Info as InfoIcon,
    Delete as DeleteIcon,
    Settings as SettingsIcon,
    Block as BlockIcon,
    CheckCircle as CheckCircleIcon,
    OpenInNew as OpenInNewIcon
} from '@mui/icons-material';
import MappingModal from './MappingModal';

// Helper to format bytes
function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default function DirectoryDetail({ directory, mappings, onBack, onMappingsUpdated }) {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Pagination & Search
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeSearch, setActiveSearch] = useState('');
    
    // S3 specific pagination tracking
    const [tokens, setTokens] = useState({ 0: null });
    const [hasMore, setHasMore] = useState(false);

    // Filters
    const [classificationFilter, setClassificationFilter] = useState('ALL');
    const [recordStatusFilter, setRecordStatusFilter] = useState('ALL');
    const [fileTypeFilter, setFileTypeFilter] = useState('ALL');

    // Selection
    const [selectedKeys, setSelectedKeys] = useState([]);

    // Modals
    const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
    const [selectedFileForMeta, setSelectedFileForMeta] = useState(null);
    const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
    
    // Bulk Delete State
    const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
    const [deletingFile, setDeletingFile] = useState(false);
    const [replacementUrls, setReplacementUrls] = useState({});

    // Directory Deactivation
    const [isDeactivating, setIsDeactivating] = useState(false);

    const fetchFiles = async (currentPage, currentRowsPerPage, currentSearch, currentTokens) => {
        setLoading(true);
        try {
            const currentToken = currentTokens[currentPage];
            
            let url = `/api/file-management/files?directoryId=${directory.id}&limit=${currentRowsPerPage}`;
            if (currentSearch) {
                url += `&search=${encodeURIComponent(currentSearch)}&page=${currentPage}`;
            } else if (currentToken) {
                url += `&continuationToken=${encodeURIComponent(currentToken)}`;
            }

            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to fetch files');
            const data = await res.json();
            
            setFiles(data.files);
            setHasMore(data.isTruncated);

            if (data.isTruncated && data.nextContinuationToken) {
                setTokens(prev => ({ ...prev, [currentPage + 1]: data.nextContinuationToken }));
            }
        } catch (err) {
            console.error(err);
            alert('Error loading files: ' + err.message);
        } finally {
            setLoading(false);
            setSelectedKeys([]);
        }
    };

    useEffect(() => {
        setPage(0);
        setTokens({ 0: null });
        fetchFiles(0, rowsPerPage, activeSearch, { 0: null });
    }, [activeSearch, directory.id, rowsPerPage]);

    const handlePageChange = (event, newPage) => {
        setPage(newPage);
        fetchFiles(newPage, rowsPerPage, activeSearch, tokens);
    };

    const handleRowsPerPageChange = (event) => {
        const newRows = parseInt(event.target.value, 10);
        setRowsPerPage(newRows);
        setPage(0);
        setTokens({ 0: null });
    };

    const handleSearchSubmit = (e) => {
        if (e.key === 'Enter') {
            setActiveSearch(searchTerm);
        }
    };

    // Filtering
    const filteredFiles = files.filter(f => {
        if (recordStatusFilter === 'ACTIVE' && f.status === 'DELETED') return false;
        if (recordStatusFilter === 'DELETED' && f.status !== 'DELETED') return false;

        if (classificationFilter !== 'ALL' && f.classification !== classificationFilter) return false;

        if (fileTypeFilter !== 'ALL') {
            const ext = (f.filename.split('.').pop() || '').toLowerCase();
            const isImg = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext);
            const isDoc = ['doc', 'docx', 'txt', 'rtf'].includes(ext);
            
            if (fileTypeFilter === 'PDF' && ext !== 'pdf') return false;
            if (fileTypeFilter === 'IMAGE' && !isImg) return false;
            if (fileTypeFilter === 'DOCUMENT' && !isDoc) return false;
            if (fileTypeFilter === 'OTHER' && (ext === 'pdf' || isImg || isDoc)) return false;
        }

        return true;
    });

    // Selection Handlers
    const handleSelectAllClick = (event) => {
        if (event.target.checked) {
            // Only select active files since deleted files cannot be deleted again
            const newSelected = filteredFiles.filter(f => f.status !== 'DELETED').map(n => n.key);
            setSelectedKeys(newSelected);
            return;
        }
        setSelectedKeys([]);
    };

    const handleClick = (event, key) => {
        const selectedIndex = selectedKeys.indexOf(key);
        let newSelected = [];

        if (selectedIndex === -1) {
            newSelected = newSelected.concat(selectedKeys, key);
        } else if (selectedIndex === 0) {
            newSelected = newSelected.concat(selectedKeys.slice(1));
        } else if (selectedIndex === selectedKeys.length - 1) {
            newSelected = newSelected.concat(selectedKeys.slice(0, -1));
        } else if (selectedIndex > 0) {
            newSelected = newSelected.concat(
                selectedKeys.slice(0, selectedIndex),
                selectedKeys.slice(selectedIndex + 1),
            );
        }
        setSelectedKeys(newSelected);
    };

    const isSelected = (key) => selectedKeys.indexOf(key) !== -1;

    // Delete flow
    const handleBulkDeleteClick = () => {
        setReplacementUrls({});
        setBulkDeleteModalOpen(true);
    };

    const confirmBulkDelete = async () => {
        setDeletingFile(true);
        try {
            const items = selectedKeys.map(key => ({
                key,
                replacementUrl: replacementUrls[key] || null
            }));

            const res = await fetch(`/api/file-management/files`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Deletion failed');
            
            setBulkDeleteModalOpen(false);
            setSelectedKeys([]);
            fetchFiles(page, rowsPerPage, activeSearch, tokens);
        } catch (err) {
            alert('Error deleting files: ' + err.message);
        } finally {
            setDeletingFile(false);
        }
    };

    const handleToggleStatus = async () => {
        if (directory.slug === 'default' && directory.is_active) {
            alert("The default directory cannot be deactivated.");
            return;
        }
        setIsDeactivating(true);
        try {
            const res = await fetch('/api/file-management/directories', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: directory.id, is_active: !directory.is_active })
            });
            if (!res.ok) throw new Error('Failed to update status');
            onBack();
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            setIsDeactivating(false);
        }
    };

    const getClassificationChip = (classification) => {
        switch (classification) {
            case 'MANAGED': return <Chip label="MANAGED" color="success" size="small" />;
            case 'LEGACY_REFERENCED': return <Chip label="LEGACY REF" color="warning" size="small" />;
            default: return <Chip label="UNMANAGED" color="default" size="small" />;
        }
    };

    const selectedFilesData = files.filter(f => selectedKeys.includes(f.key));
    const managedCount = selectedFilesData.filter(f => f.classification === 'MANAGED').length;
    const legacyCount = selectedFilesData.filter(f => f.classification === 'LEGACY_REFERENCED').length;
    const unmanagedCount = selectedFilesData.filter(f => f.classification === 'UNMANAGED').length;

    return (
        <Box>
            {/* Header Section */}
            <Box display="flex" alignItems="center" mb={3}>
                <IconButton onClick={onBack} sx={{ mr: 2 }}>
                    <ArrowBackIcon />
                </IconButton>
                <Box flexGrow={1}>
                    <Typography variant="h4" sx={{ fontWeight: 600, color: '#333' }}>
                        {directory.name}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                        S3 Prefix: {directory.s3_prefix}
                    </Typography>
                </Box>
                <Box display="flex" gap={2}>
                    <Button 
                        variant="outlined" 
                        startIcon={<SettingsIcon />}
                        onClick={() => setIsMappingModalOpen(true)}
                    >
                        Mappings ({mappings.length})
                    </Button>
                    <Button 
                        variant={directory.is_active ? "outlined" : "contained"}
                        color={directory.is_active ? "error" : "success"}
                        startIcon={directory.is_active ? <BlockIcon /> : <CheckCircleIcon />}
                        onClick={handleToggleStatus}
                        disabled={isDeactivating}
                    >
                        {directory.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                </Box>
            </Box>

            {/* Controls Section */}
            <Paper sx={{ p: 2, mb: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
                    <TextField
                        placeholder="Search files (Enter to search)..."
                        size="small"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={handleSearchSubmit}
                        sx={{ width: 300 }}
                        InputProps={{
                            startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
                        }}
                    />
                    
                    <FormControl size="small" sx={{ minWidth: 120 }}>
                        <InputLabel>Status</InputLabel>
                        <Select
                            value={recordStatusFilter}
                            label="Status"
                            onChange={e => setRecordStatusFilter(e.target.value)}
                        >
                            <MenuItem value="ALL">All</MenuItem>
                            <MenuItem value="ACTIVE">Active</MenuItem>
                            <MenuItem value="DELETED">Deleted</MenuItem>
                        </Select>
                    </FormControl>

                    <FormControl size="small" sx={{ minWidth: 150 }}>
                        <InputLabel>Classification</InputLabel>
                        <Select
                            value={classificationFilter}
                            label="Classification"
                            onChange={e => setClassificationFilter(e.target.value)}
                        >
                            <MenuItem value="ALL">All</MenuItem>
                            <MenuItem value="MANAGED">Managed</MenuItem>
                            <MenuItem value="LEGACY_REFERENCED">Legacy Ref</MenuItem>
                            <MenuItem value="UNMANAGED">Unmanaged</MenuItem>
                        </Select>
                    </FormControl>

                    <FormControl size="small" sx={{ minWidth: 120 }}>
                        <InputLabel>File Type</InputLabel>
                        <Select
                            value={fileTypeFilter}
                            label="File Type"
                            onChange={e => setFileTypeFilter(e.target.value)}
                        >
                            <MenuItem value="ALL">All</MenuItem>
                            <MenuItem value="PDF">PDF</MenuItem>
                            <MenuItem value="IMAGE">Images</MenuItem>
                            <MenuItem value="DOCUMENT">Documents</MenuItem>
                            <MenuItem value="OTHER">Other</MenuItem>
                        </Select>
                    </FormControl>
                </Box>

                {selectedKeys.length > 0 && (
                    <Box display="flex" gap={2} alignItems="center" p={1} bgcolor="#fff3e0" borderRadius={1}>
                        <Typography variant="body2" fontWeight={500}>
                            {selectedKeys.length} items selected
                        </Typography>
                        <Button size="small" color="error" variant="contained" onClick={handleBulkDeleteClick}>
                            Delete Selected
                        </Button>
                        <Button size="small" onClick={() => setSelectedKeys([])}>
                            Clear Selection
                        </Button>
                    </Box>
                )}
            </Paper>

            {/* Table Section */}
            <TableContainer component={Paper}>
                <Table size="small">
                    <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
                        <TableRow>
                            <TableCell padding="checkbox">
                                <Checkbox
                                    color="primary"
                                    indeterminate={selectedKeys.length > 0 && selectedKeys.length < filteredFiles.filter(f=>f.status!=='DELETED').length}
                                    checked={filteredFiles.length > 0 && selectedKeys.length === filteredFiles.filter(f=>f.status!=='DELETED').length}
                                    onChange={handleSelectAllClick}
                                    inputProps={{ 'aria-label': 'select all' }}
                                />
                            </TableCell>
                            <TableCell>Filename</TableCell>
                            <TableCell>Size</TableCell>
                            <TableCell>Status / Class</TableCell>
                            <TableCell>Notice Reference</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                                    <CircularProgress size={30} sx={{ color: '#830001' }} />
                                </TableCell>
                            </TableRow>
                        ) : filteredFiles.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                                    No files found matching criteria.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredFiles.map((file) => {
                                const isItemSelected = isSelected(file.key);
                                const isDeleted = file.status === 'DELETED';
                                
                                return (
                                    <TableRow 
                                        key={file.key} 
                                        hover 
                                        selected={isItemSelected}
                                        sx={{ opacity: isDeleted ? 0.6 : 1 }}
                                    >
                                        <TableCell padding="checkbox">
                                            <Checkbox
                                                color="primary"
                                                checked={isItemSelected}
                                                onChange={(event) => handleClick(event, file.key)}
                                                disabled={isDeleted}
                                            />
                                        </TableCell>
                                        <TableCell sx={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            <Typography variant="body2" sx={{ fontWeight: file.classification === 'MANAGED' ? 500 : 400, textDecoration: isDeleted ? 'line-through' : 'none' }}>
                                                {file.filename}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>{formatBytes(file.size)}</TableCell>
                                        <TableCell>
                                            <Stack gap={0.5} alignItems="flex-start">
                                                {getClassificationChip(file.classification)}
                                                {isDeleted && <Chip label="DELETED" size="small" color="error" variant="outlined" />}
                                            </Stack>
                                        </TableCell>
                                        <TableCell>
                                            {file.notice_title ? (
                                                <Tooltip title={`ID: ${file.notice_id}`}>
                                                    <Typography variant="body2" noWrap sx={{ maxWidth: 180 }}>
                                                        {file.notice_title}
                                                    </Typography>
                                                </Tooltip>
                                            ) : file.notice_id ? (
                                                <Typography variant="body2">ID: {file.notice_id}</Typography>
                                            ) : (
                                                <Typography variant="body2" color="textSecondary">—</Typography>
                                            )}
                                        </TableCell>
                                        <TableCell align="right">
                                            {!isDeleted && (
                                                <Tooltip title="View File">
                                                    <IconButton size="small" onClick={() => window.open(file.url, '_blank')}>
                                                        <VisibilityIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                            {isDeleted && file.replacement_url && (
                                                <Tooltip title="Open Replacement URL">
                                                    <IconButton size="small" onClick={() => window.open(file.replacement_url, '_blank')}>
                                                        <OpenInNewIcon fontSize="small" color="info" />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                            <Tooltip title="File Metadata">
                                                <IconButton size="small" onClick={() => { setSelectedFileForMeta(file); setIsMetadataModalOpen(true); }}>
                                                    <InfoIcon fontSize="small" color="info" />
                                                </IconButton>
                                            </Tooltip>
                                            {!isDeleted && (
                                                <Tooltip title="Delete S3 Object">
                                                    <IconButton size="small" onClick={() => {
                                                        setSelectedKeys([file.key]);
                                                        handleBulkDeleteClick();
                                                    }}>
                                                        <DeleteIcon fontSize="small" color="error" />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                )
                            })
                        )}
                    </TableBody>
                </Table>
                
                <TablePagination
                    component="div"
                    count={hasMore ? -1 : page * rowsPerPage + files.length}
                    page={page}
                    onPageChange={handlePageChange}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={handleRowsPerPageChange}
                    labelDisplayedRows={({ from, to, count }) => {
                        return `${from}–${to} of ${count !== -1 ? count : `more than ${to}`}`;
                    }}
                />
            </TableContainer>

            {isMappingModalOpen && (
                <MappingModal 
                    open={isMappingModalOpen}
                    onClose={() => setIsMappingModalOpen(false)}
                    directory={directory}
                    mappings={mappings}
                    onMappingsUpdated={onMappingsUpdated}
                />
            )}

            <Dialog open={isMetadataModalOpen} onClose={() => setIsMetadataModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>File Metadata</DialogTitle>
                <DialogContent dividers>
                    {selectedFileForMeta && (
                        <Box display="flex" flexDirection="column" gap={1.5}>
                            <Box><Typography variant="caption" color="textSecondary">Filename</Typography><Typography>{selectedFileForMeta.filename}</Typography></Box>
                            <Box><Typography variant="caption" color="textSecondary">S3 Key</Typography><Typography sx={{ wordBreak: 'break-all' }}>{selectedFileForMeta.key}</Typography></Box>
                            <Box><Typography variant="caption" color="textSecondary">Classification</Typography><Box mt={0.5}>{getClassificationChip(selectedFileForMeta.classification)}</Box></Box>
                            
                            {selectedFileForMeta.original_filename && (
                                <Box><Typography variant="caption" color="textSecondary">Original Filename</Typography><Typography>{selectedFileForMeta.original_filename}</Typography></Box>
                            )}
                            
                            <Box><Typography variant="caption" color="textSecondary">Size</Typography><Typography>{formatBytes(selectedFileForMeta.size)}</Typography></Box>
                            
                            {selectedFileForMeta.status === 'DELETED' ? (
                                <>
                                    <Box><Typography variant="caption" color="textSecondary">Status</Typography><Typography color="error">DELETED</Typography></Box>
                                    <Box><Typography variant="caption" color="textSecondary">Deleted At</Typography><Typography>{new Date(selectedFileForMeta.deleted_at).toLocaleString()}</Typography></Box>
                                    <Box><Typography variant="caption" color="textSecondary">Deleted By</Typography><Typography>{selectedFileForMeta.deleted_by}</Typography></Box>
                                    {selectedFileForMeta.replacement_url && (
                                        <Box><Typography variant="caption" color="textSecondary">Replacement URL</Typography><Typography sx={{ wordBreak: 'break-all' }}><a href={selectedFileForMeta.replacement_url} target="_blank" rel="noreferrer">{selectedFileForMeta.replacement_url}</a></Typography></Box>
                                    )}
                                </>
                            ) : (
                                <Box><Typography variant="caption" color="textSecondary">Last Modified (S3)</Typography><Typography>{new Date(selectedFileForMeta.lastModified).toLocaleString()}</Typography></Box>
                            )}
                            
                            {selectedFileForMeta.uploaded_by && (
                                <Box><Typography variant="caption" color="textSecondary">Uploaded By</Typography><Typography>{selectedFileForMeta.uploaded_by}</Typography></Box>
                            )}

                            {selectedFileForMeta.notice_id && (
                                <Box><Typography variant="caption" color="textSecondary">Notice Reference</Typography><Typography>ID: {selectedFileForMeta.notice_id} {selectedFileForMeta.notice_title && `- ${selectedFileForMeta.notice_title}`}</Typography></Box>
                            )}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsMetadataModalOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={bulkDeleteModalOpen} onClose={() => !deletingFile && setBulkDeleteModalOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ color: '#d32f2f' }}>Confirm Deletion</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{ mb: 2 }}>
                        You are about to permanently delete <strong>{selectedKeys.length}</strong> S3 object(s).
                    </DialogContentText>
                    <Box display="flex" gap={2} mb={3}>
                        <Chip label={`Managed: ${managedCount}`} color="success" variant="outlined" />
                        <Chip label={`Legacy Referenced: ${legacyCount}`} color="warning" variant="outlined" />
                        <Chip label={`Unmanaged: ${unmanagedCount}`} color="default" variant="outlined" />
                    </Box>

                    {legacyCount > 0 && (
                        <Alert severity="error" sx={{ mb: 3 }}>
                            <strong>Warning:</strong> You are deleting files referenced by existing legacy notices. Providing a replacement URL (e.g. Google Drive) will update the notice to use the new link.
                        </Alert>
                    )}

                    {(managedCount > 0 || legacyCount > 0) && (
                        <Box mt={2}>
                            <Typography variant="subtitle2" gutterBottom>Optional Replacement URLs</Typography>
                            <Table size="small">
                                <TableBody>
                                    {selectedFilesData.filter(f => f.classification !== 'UNMANAGED').map(file => (
                                        <TableRow key={file.key}>
                                            <TableCell sx={{ width: '40%' }}>
                                                <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>{file.filename}</Typography>
                                                <Typography variant="caption" color="textSecondary">{file.classification}</Typography>
                                            </TableCell>
                                            <TableCell>
                                                <TextField
                                                    size="small"
                                                    fullWidth
                                                    placeholder="e.g., https://drive.google.com/..."
                                                    value={replacementUrls[file.key] || ''}
                                                    onChange={(e) => setReplacementUrls(prev => ({...prev, [file.key]: e.target.value}))}
                                                    disabled={deletingFile}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </Box>
                    )}

                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setBulkDeleteModalOpen(false)} disabled={deletingFile}>Cancel</Button>
                    <Button color="error" variant="contained" onClick={confirmBulkDelete} disabled={deletingFile}>
                        {deletingFile ? 'Deleting...' : `Delete ${selectedKeys.length} items`}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
