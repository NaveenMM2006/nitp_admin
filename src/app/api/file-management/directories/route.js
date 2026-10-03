import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { query } from '@/lib/db';

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
    const directories = await query('SELECT * FROM file_directories ORDER BY name ASC');
    return NextResponse.json(directories);
  } catch (error) {
    console.error('Error fetching directories:', error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!(await checkSuperAdmin(session))) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { name, slug, description } = await request.json();
    
    if (!name || !slug) {
      return NextResponse.json({ message: 'Name and slug are required' }, { status: 400 });
    }

    const s3Prefix = `notices/${slug}/`;
    
    const result = await query(
      'INSERT INTO file_directories (name, slug, s3_prefix, description, created_by) VALUES (?, ?, ?, ?, ?)',
      [name, slug, s3Prefix, description || null, session.user.email]
    );

    return NextResponse.json({ success: true, id: result.insertId, s3_prefix: s3Prefix });
  } catch (error) {
    console.error('Error creating directory:', error);
    if (error.errno === 1062) { // Duplicate entry
      return NextResponse.json({ message: 'Directory name or slug already exists' }, { status: 409 });
    }
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  const session = await getServerSession(authOptions);
  if (!(await checkSuperAdmin(session))) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { id, is_active, description } = await request.json();

    if (!id) {
      return NextResponse.json({ message: 'Directory ID is required' }, { status: 400 });
    }
    
    // Prevent deactivating the Default directory
    const dirResult = await query('SELECT slug FROM file_directories WHERE id = ?', [id]);
    if (dirResult.length > 0 && dirResult[0].slug === 'default' && is_active === false) {
      return NextResponse.json({ message: 'Cannot deactivate the default directory' }, { status: 400 });
    }

    let updateFields = [];
    let updateValues = [];

    if (is_active !== undefined) {
      updateFields.push('is_active = ?');
      updateValues.push(is_active);
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }

    if (updateFields.length === 0) {
      return NextResponse.json({ message: 'No valid fields provided for update' }, { status: 400 });
    }

    updateValues.push(id);
    
    const sql = `UPDATE file_directories SET ${updateFields.join(', ')} WHERE id = ?`;
    await query(sql, updateValues);

    return NextResponse.json({ success: true, message: 'Directory updated successfully' });
  } catch (error) {
    console.error('Error updating directory:', error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
