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
    const mappings = await query(`
      SELECT m.*, d.name as directory_name 
      FROM directory_notice_mapping m
      JOIN file_directories d ON m.directory_id = d.id
      ORDER BY m.notice_type, m.notice_sub_type
    `);
    return NextResponse.json(mappings);
  } catch (error) {
    console.error('Error fetching mappings:', error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!(await checkSuperAdmin(session))) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  try {
    let { directory_id, notice_type, notice_sub_type } = await request.json();
    
    if (!directory_id || !notice_type) {
      return NextResponse.json({ message: 'Directory ID and Notice Type are required' }, { status: 400 });
    }

    // null means "all subtypes"
    notice_sub_type = notice_sub_type || null;

    // Manual check to prevent duplicates (since unique constraints on NULL can be tricky, although we used a generated column)
    const existing = await query(
      'SELECT id FROM directory_notice_mapping WHERE directory_id = ? AND notice_type = ? AND notice_sub_type <=> ?',
      [directory_id, notice_type, notice_sub_type]
    );

    if (existing.length > 0) {
      return NextResponse.json({ message: 'Mapping already exists' }, { status: 409 });
    }

    const result = await query(
      'INSERT INTO directory_notice_mapping (directory_id, notice_type, notice_sub_type, created_by) VALUES (?, ?, ?, ?)',
      [directory_id, notice_type, notice_sub_type, session.user.email]
    );

    return NextResponse.json({ success: true, id: result.insertId });
  } catch (error) {
    console.error('Error creating mapping:', error);
    if (error.errno === 1062) { // Duplicate entry fallback
      return NextResponse.json({ message: 'Mapping already exists' }, { status: 409 });
    }
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const session = await getServerSession(authOptions);
  if (!(await checkSuperAdmin(session))) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ message: 'Mapping ID is required' }, { status: 400 });
    }

    await query('DELETE FROM directory_notice_mapping WHERE id = ?', [id]);

    return NextResponse.json({ success: true, message: 'Mapping deleted successfully' });
  } catch (error) {
    console.error('Error deleting mapping:', error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
