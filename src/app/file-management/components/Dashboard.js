import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Button, Paper, Grid, Card, CardContent, 
    Divider, IconButton, Chip, CircularProgress, Alert
} from '@mui/material';
import { Add as AddIcon, Folder as FolderIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import DirectoryModal from './DirectoryModal';
import DirectoryDetail from './DirectoryDetail';

export default function FileManagementDashboard() {
    const [directories, setDirectories] = useState([]);
    const [mappings, setMappings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedDirectory, setSelectedDirectory] = useState(null);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [dirsRes, mapsRes] = await Promise.all([
                fetch('/api/file-management/directories'),
                fetch('/api/file-management/mappings')
            ]);

            if (!dirsRes.ok) throw new Error('Failed to fetch directories');
            if (!mapsRes.ok) throw new Error('Failed to fetch mappings');

            const dirsData = await dirsRes.json();
            const mapsData = await mapsRes.json();

            setDirectories(dirsData);
            setMappings(mapsData);
        } catch (err) {
            console.error('Error fetching file management data:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleCreateDirectory = async (newDir) => {
        await fetchData(); // Refresh list
        setIsCreateModalOpen(false);
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
                <CircularProgress sx={{ color: '#830001' }} />
            </Box>
        );
    }

    if (error) {
        return <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>;
    }

    // If a directory is selected, show its detail view
    if (selectedDirectory) {
        return (
            <DirectoryDetail 
                directory={selectedDirectory} 
                mappings={mappings.filter(m => m.directory_id === selectedDirectory.id)}
                onBack={() => {
                    setSelectedDirectory(null);
                    fetchData(); // Refresh in case mappings or status changed
                }}
                onMappingsUpdated={fetchData}
            />
        );
    }

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h4" sx={{ fontWeight: 600, color: '#333' }}>
                    File Management
                </Typography>
                <Button 
                    variant="contained" 
                    startIcon={<AddIcon />}
                    onClick={() => setIsCreateModalOpen(true)}
                    sx={{ backgroundColor: '#830001', '&:hover': { backgroundColor: '#6a0001' } }}
                >
                    New Directory
                </Button>
            </Box>

            {/* Overview Cards */}
            <Grid container spacing={3} mb={4}>
                <Grid item xs={12} sm={4}>
                    <Card sx={{ borderLeft: '4px solid #830001' }}>
                        <CardContent>
                            <Typography color="textSecondary" gutterBottom>
                                Total Directories
                            </Typography>
                            <Typography variant="h5">
                                {directories.length}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={4}>
                    <Card sx={{ borderLeft: '4px solid #4caf50' }}>
                        <CardContent>
                            <Typography color="textSecondary" gutterBottom>
                                Active Directories
                            </Typography>
                            <Typography variant="h5">
                                {directories.filter(d => d.is_active).length}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={4}>
                    <Card sx={{ borderLeft: '4px solid #2196f3' }}>
                        <CardContent>
                            <Typography color="textSecondary" gutterBottom>
                                Notice Mappings
                            </Typography>
                            <Typography variant="h5">
                                {mappings.length}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <Typography variant="h5" sx={{ fontWeight: 500, color: '#333', mb: 2 }}>
                Directories
            </Typography>
            <Divider sx={{ mb: 3 }} />

            <Grid container spacing={2}>
                {directories.map((dir) => (
                    <Grid item xs={12} key={dir.id}>
                        <Paper 
                            sx={{ 
                                p: 2, 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'space-between',
                                transition: '0.2s',
                                '&:hover': {
                                    boxShadow: 3,
                                    cursor: 'pointer',
                                    backgroundColor: '#fafafa'
                                }
                            }}
                            onClick={() => setSelectedDirectory(dir)}
                        >
                            <Box display="flex" alignItems="center">
                                <FolderIcon sx={{ color: dir.is_active ? '#830001' : '#9e9e9e', mr: 2, fontSize: 40 }} />
                                <Box>
                                    <Typography variant="h6" sx={{ color: dir.is_active ? '#333' : '#757575' }}>
                                        {dir.name} {dir.slug === 'default' && <Chip label="Default" size="small" color="primary" variant="outlined" sx={{ ml: 1 }} />}
                                    </Typography>
                                    <Typography variant="body2" color="textSecondary">
                                        Prefix: {dir.s3_prefix}
                                    </Typography>
                                </Box>
                            </Box>
                            
                            <Box display="flex" alignItems="center" gap={2}>
                                {dir.is_active ? (
                                    <Chip label="Active" color="success" size="small" />
                                ) : (
                                    <Chip label="Inactive" color="default" size="small" />
                                )}
                                
                                <Box textAlign="right" display={{ xs: 'none', sm: 'block' }}>
                                    <Typography variant="body2" color="textSecondary">
                                        Mappings
                                    </Typography>
                                    <Typography variant="subtitle2">
                                        {mappings.filter(m => m.directory_id === dir.id).length}
                                    </Typography>
                                </Box>
                            </Box>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            {isCreateModalOpen && (
                <DirectoryModal 
                    open={isCreateModalOpen} 
                    onClose={() => setIsCreateModalOpen(false)} 
                    onCreated={handleCreateDirectory}
                />
            )}
        </Box>
    );
}
