import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { query, transaction } from '@/lib/db';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function checkSuperAdmin(session) {
  if (!session || session.user.role !== 'SUPER_ADMIN') {
    return false;
  }
  return true;
}

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!(await checkSuperAdmin(session))) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const directoryId = searchParams.get('directoryId');
    const continuationToken = searchParams.get('continuationToken');

    const search = searchParams.get('search');
    const pageStr = searchParams.get('page') || '0';
    const limitStr = searchParams.get('limit') || '100';
    const page = parseInt(pageStr, 10);
    const limit = parseInt(limitStr, 10);

    if (!directoryId) {
      return NextResponse.json({ message: 'Directory ID is required' }, { status: 400 });
    }

    // 1. Fetch directory prefix
    const dirResult = await query('SELECT s3_prefix FROM file_directories WHERE id = ?', [directoryId]);
    if (dirResult.length === 0) {
      return NextResponse.json({ message: 'Directory not found' }, { status: 404 });
    }
    const s3Prefix = dirResult[0].s3_prefix;

    let s3Objects = [];
    let isTruncated = false;
    let nextContinuationToken = null;

    // 2. Fetch S3 Objects
    if (search && search.trim() !== '') {
      // SEARCH MODE: Prefix scan, in-memory filter, array slice pagination
      let internalContinuationToken = undefined;
      const MAX_SCAN_LIMIT = 5000;
      let scannedCount = 0;
      let allObjects = [];

      do {
        const commandParams = {
          Bucket: process.env.AWS_S3_BUCKET_NAME,
          Prefix: s3Prefix,
          MaxKeys: 1000,
          ContinuationToken: internalContinuationToken
        };
        const response = await s3Client.send(new ListObjectsV2Command(commandParams));
        if (response.Contents) {
          allObjects = allObjects.concat(response.Contents);
          scannedCount += response.Contents.length;
        }
        internalContinuationToken = response.NextContinuationToken;
      } while (internalContinuationToken && scannedCount < MAX_SCAN_LIMIT);

      // Filter by substring (case-insensitive)
      const searchLower = search.toLowerCase();
      const filteredObjects = allObjects.filter(obj => {
        // Extract filename from key
        const filename = obj.Key.split('/').pop();
        return filename.toLowerCase().includes(searchLower);
      });

      // Paginate the filtered array
      const startIndex = page * limit;
      const endIndex = startIndex + limit;
      s3Objects = filteredObjects.slice(startIndex, endIndex);
      
      // Tell UI if there is a next page
      isTruncated = endIndex < filteredObjects.length;
      nextContinuationToken = isTruncated ? 'has_more_search' : null;
    } else {
      // NORMAL MODE: S3 Native Pagination
      const commandParams = {
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Prefix: s3Prefix,
        MaxKeys: limit
      };
      if (continuationToken && continuationToken !== 'null') {
        commandParams.ContinuationToken = continuationToken;
      }

      const s3Response = await s3Client.send(new ListObjectsV2Command(commandParams));
      s3Objects = s3Response.Contents || [];
      isTruncated = s3Response.IsTruncated;
      nextContinuationToken = s3Response.NextContinuationToken || null;
    }

    // 3. Fast Cross-Reference Setup
    // Get all files for this directory (including deleted)
    const managedFilesDB = await query('SELECT s3_key, id, notice_id, original_filename, uploaded_by, status, deleted_at, deleted_by, replacement_url, file_size FROM notice_attachments WHERE directory_id = ?', [directoryId]);
    const managedMap = new Map();
    const deletedFiles = [];
    
    for (const row of managedFilesDB) {
      if (row.status === 'DELETED') {
        deletedFiles.push(row);
      } else {
        managedMap.set(row.s3_key, row);
      }
    }

    // Get all legacy references (where attachments contains AWS URL)
    const noticesDB = await query('SELECT id, attachments, title FROM notices WHERE attachments LIKE "%amazonaws.com%"');
    const legacyUrlSet = new Set();
    const legacyNoticeMap = new Map(); // url -> { id, title }

    for (const notice of noticesDB) {
      try {
        if (!notice.attachments) continue;
        const parsed = JSON.parse(notice.attachments);
        if (Array.isArray(parsed)) {
          for (const att of parsed) {
            if (att.url && typeof att.url === 'string' && att.url.includes('.amazonaws.com')) {
              legacyUrlSet.add(att.url);
              legacyNoticeMap.set(att.url, { id: notice.id, title: notice.title });
            }
          }
        }
      } catch (e) {
        // Skip invalid JSON
      }
    }

    // 4. Classification
    let files = s3Objects.map(obj => {
      const s3Url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${obj.Key}`;
      
      let classification = 'UNMANAGED';
      let metadata = {};

      if (managedMap.has(obj.Key)) {
        classification = 'MANAGED';
        const dbRow = managedMap.get(obj.Key);
        metadata = {
          attachment_id: dbRow.id,
          notice_id: dbRow.notice_id,
          original_filename: dbRow.original_filename,
          uploaded_by: dbRow.uploaded_by,
          status: 'ACTIVE'
        };
      } else if (legacyUrlSet.has(s3Url)) {
        classification = 'LEGACY_REFERENCED';
        const noticeRef = legacyNoticeMap.get(s3Url);
        metadata = {
          notice_id: noticeRef.id,
          notice_title: noticeRef.title,
          status: 'ACTIVE'
        };
      } else {
         metadata = { status: 'ACTIVE' };
      }

      // Explicitly extract the filename for convenience in UI
      const filename = obj.Key.split('/').pop();

      return {
        key: obj.Key,
        filename: filename,
        url: s3Url,
        size: obj.Size,
        lastModified: obj.LastModified,
        storageClass: obj.StorageClass,
        eTag: obj.ETag,
        classification,
        ...metadata
      };
    });

    // Append DELETED files from DB (only on first page or in search to avoid duplicates across pages)
    if ((!continuationToken || continuationToken === 'null') && (!search || page === 0)) {
        const deletedMapped = deletedFiles.map(row => {
            const filename = row.s3_key.split('/').pop();
            const s3Url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${row.s3_key}`;
            return {
                key: row.s3_key,
                filename: filename,
                url: s3Url,
                size: row.file_size || 0,
                lastModified: row.deleted_at, // Use deleted_at for sorting/display
                classification: 'MANAGED',
                attachment_id: row.id,
                notice_id: row.notice_id,
                original_filename: row.original_filename,
                uploaded_by: row.uploaded_by,
                status: 'DELETED',
                deleted_at: row.deleted_at,
                deleted_by: row.deleted_by,
                replacement_url: row.replacement_url
            };
        });
        
        // If there's a search, filter deleted files too
        if (search && search.trim() !== '') {
            const searchLower = search.toLowerCase();
            const filteredDeleted = deletedMapped.filter(obj => obj.filename.toLowerCase().includes(searchLower));
            files = [...filteredDeleted, ...files];
        } else {
            files = [...deletedMapped, ...files];
        }
    }

    return NextResponse.json({
      files,
      isTruncated,
      nextContinuationToken
    });
  } catch (error) {
    console.error('Error listing files:', error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const session = await getServerSession(authOptions);
  if (!(await checkSuperAdmin(session))) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  try {
    let itemsToDelete = [];

    // Support both GET-style query param (legacy) and JSON body (bulk)
    const { searchParams } = new URL(request.url);
    const keyQuery = searchParams.get('key');
    
    if (keyQuery) {
        itemsToDelete = [{ key: keyQuery }];
    } else {
        const body = await request.json();
        if (body.items && Array.isArray(body.items)) {
            itemsToDelete = body.items;
        } else if (body.key) {
            itemsToDelete = [body];
        } else {
            return NextResponse.json({ message: 'Missing items or key to delete' }, { status: 400 });
        }
    }

    let successCount = 0;
    let errors = [];

    for (const item of itemsToDelete) {
        try {
            const { key, replacementUrl } = item;
            const s3Url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

            // 1. Check DB for managed files
            const managedFiles = await query('SELECT notice_id, s3_url, status FROM notice_attachments WHERE s3_key = ? AND status = "ACTIVE"', [key]);
            const isManaged = managedFiles && managedFiles.length > 0;
            
            // 2. Check DB for legacy references (if not managed)
            let isLegacy = false;
            let legacyNoticeIds = [];
            if (!isManaged) {
                 const noticesDB = await query('SELECT id, attachments FROM notices WHERE attachments LIKE ?', [`%${key}%`]);
                 for (const n of noticesDB) {
                     try {
                         const atts = JSON.parse(n.attachments);
                         if (atts.some(a => a.url === s3Url)) {
                             isLegacy = true;
                             legacyNoticeIds.push(n.id);
                         }
                     } catch(e) {}
                 }
            }

            // 3. Delete from S3
            try {
                const command = new DeleteObjectCommand({
                    Bucket: process.env.AWS_S3_BUCKET_NAME,
                    Key: key,
                });
                await s3Client.send(command);
            } catch (s3Error) {
                console.warn(`S3 delete failed for ${key}, continuing with DB cleanup. Error:`, s3Error);
            }

            // 4. Update DB
            if (isManaged) {
                const noticeId = managedFiles[0].notice_id;
                
                // Soft delete in notice_attachments
                await query(
                    'UPDATE notice_attachments SET status = ?, deleted_at = NOW(), deleted_by = ?, replacement_url = ? WHERE s3_key = ?', 
                    ['DELETED', session.user.email, replacementUrl || null, key]
                );

                // Update notices.attachments
                const noticeRow = await query('SELECT attachments FROM notices WHERE id = ?', [noticeId]);
                if (noticeRow && noticeRow.length > 0 && noticeRow[0].attachments) {
                    try {
                        let attachmentsArray = JSON.parse(noticeRow[0].attachments);
                        if (Array.isArray(attachmentsArray)) {
                            let updated = false;
                            attachmentsArray = attachmentsArray.map(att => {
                                if (att.url === s3Url) {
                                    updated = true;
                                    if (replacementUrl) {
                                        return { ...att, url: replacementUrl, isReplacement: true };
                                    }
                                    return null; // Will filter out
                                }
                                return att;
                            }).filter(Boolean);
                            
                            if (updated) {
                                await query('UPDATE notices SET attachments = ? WHERE id = ?', [JSON.stringify(attachmentsArray), noticeId]);
                            }
                        }
                    } catch (e) {
                        console.error(`Error parsing JSON for notice ${noticeId} during cleanup:`, e);
                    }
                }
            } else if (isLegacy && legacyNoticeIds.length > 0) {
                 // Update notices.attachments for legacy
                 for (const nId of legacyNoticeIds) {
                     const noticeRow = await query('SELECT attachments FROM notices WHERE id = ?', [nId]);
                     if (noticeRow && noticeRow.length > 0 && noticeRow[0].attachments) {
                         try {
                             let attachmentsArray = JSON.parse(noticeRow[0].attachments);
                             if (Array.isArray(attachmentsArray)) {
                                 let updated = false;
                                 attachmentsArray = attachmentsArray.map(att => {
                                     if (att.url === s3Url) {
                                         updated = true;
                                         if (replacementUrl) {
                                             return { ...att, url: replacementUrl, isReplacement: true };
                                         }
                                         return null;
                                     }
                                     return att;
                                 }).filter(Boolean);
                                 
                                 if (updated) {
                                     await query('UPDATE notices SET attachments = ? WHERE id = ?', [JSON.stringify(attachmentsArray), nId]);
                                 }
                             }
                         } catch (e) {}
                     }
                 }
            }

            successCount++;
        } catch (itemError) {
            console.error(`Failed to delete item ${item.key}:`, itemError);
            errors.push({ key: item.key, error: itemError.message });
        }
    }

    if (errors.length > 0) {
        return NextResponse.json({ success: false, message: `Deleted ${successCount}, failed ${errors.length}`, errors }, { status: 207 });
    }

    return NextResponse.json({ success: true, message: `Successfully deleted ${successCount} files` });
  } catch (error) {
    console.error('Error in bulk delete:', error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
