import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { depList } from '@/lib/const'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)

    const type = searchParams.get('type')
    const emailParam = searchParams.get('email')
    const page = Math.max(1, parseInt(searchParams.get('page')) || 1)
    const limit = Math.min(50, parseInt(searchParams.get('limit')) || 20)
    const offset = (page - 1) * limit

    let total = 0

    // Check if querying by email specifically
    if (emailParam) {
      const count = await query(`
        SELECT 
          (SELECT COUNT(DISTINCT sp.id) 
           FROM sponsored_projects sp 
           LEFT JOIN sponsored_projects_collaborater spc ON sp.id = spc.sponsored_project_id 
           WHERE sp.email = ? OR spc.email = ?) +
          (SELECT COUNT(DISTINCT cp.id) 
           FROM consultancy_projects cp 
           LEFT JOIN consultancy_projects_collaborater cpc ON cp.id = cpc.consultancy_projects_id 
           WHERE cp.email = ? OR cpc.email = ?) AS count
      `, [emailParam, emailParam, emailParam, emailParam])

      total = Number(count[0].count)

      const results = await query(`
        SELECT * FROM (
          SELECT 
            sp.id, sp.email, sp.project_title, sp.funding_agency,
            sp.financial_outlay, sp.investigators, sp.pi_institute,
            sp.status, sp.funds_received, sp.role,
            sp.start_date, sp.end_date,
            GROUP_CONCAT(DISTINCT spc.email) AS collaboraters,
            'sponsored' AS project_type, sp.end_date AS sort_date
          FROM sponsored_projects sp
          LEFT JOIN sponsored_projects_collaborater spc ON sp.id = spc.sponsored_project_id
          WHERE sp.email = ? OR sp.id IN (SELECT sponsored_project_id FROM sponsored_projects_collaborater WHERE email = ?)
          GROUP BY sp.id

          UNION ALL

          SELECT 
            cp.id, cp.email, cp.project_title, cp.funding_agency,
            cp.financial_outlay, cp.investigators, NULL AS pi_institute,
            cp.status, NULL AS funds_received, cp.role,
            cp.start_date, NULL AS end_date,
            GROUP_CONCAT(DISTINCT cpc.email) AS collaboraters,
            'consultancy' AS project_type, cp.start_date AS sort_date
          FROM consultancy_projects cp
          LEFT JOIN consultancy_projects_collaborater cpc ON cp.id = cpc.consultancy_projects_id
          WHERE cp.email = ? OR cp.id IN (SELECT consultancy_projects_id FROM consultancy_projects_collaborater WHERE email = ?)
          GROUP BY cp.id
        ) AS combined
        ORDER BY sort_date DESC
        LIMIT ${limit} OFFSET ${offset}
      `, [emailParam, emailParam, emailParam, emailParam])

      const dataWithCollaborators = results.map(row => ({
        ...row,
        collaboraters: row.collaboraters ? row.collaboraters.split(',').map(s => s.trim()).filter(Boolean) : []
      }))

      return NextResponse.json({
        page,
        limit,
        offset,
        total,
        totalPages: Math.ceil(total / limit),
        data: dataWithCollaborators
      })
    }

    switch (type) {
      case 'all': {
        const count = await query(`
          SELECT 
            (SELECT COUNT(*) FROM sponsored_projects) +
            (SELECT COUNT(*) FROM consultancy_projects) AS count
        `)

        total = Number(count[0].count)

        const results = await query(`
          SELECT * FROM (
          SELECT 
            sp.id, sp.email, sp.project_title, sp.funding_agency,
            sp.financial_outlay, sp.investigators, sp.pi_institute,
            sp.status, sp.funds_received, sp.role,
            sp.start_date, sp.end_date,
            GROUP_CONCAT(DISTINCT spc.email) AS collaboraters,
            'sponsored' AS project_type, sp.end_date AS sort_date
          FROM sponsored_projects sp
          LEFT JOIN sponsored_projects_collaborater spc ON sp.id = spc.sponsored_project_id
          GROUP BY sp.id

          UNION ALL

          SELECT 
            cp.id, cp.email, cp.project_title, cp.funding_agency,
            cp.financial_outlay, cp.investigators, NULL AS pi_institute,
            cp.status, NULL AS funds_received, cp.role,
            cp.start_date, NULL AS end_date,
            GROUP_CONCAT(DISTINCT cpc.email) AS collaboraters,
            'consultancy' AS project_type, cp.start_date AS sort_date
          FROM consultancy_projects cp
          LEFT JOIN consultancy_projects_collaborater cpc ON cp.id = cpc.consultancy_projects_id
          GROUP BY cp.id
          ) AS combined
          ORDER BY sort_date DESC
          LIMIT ${limit} OFFSET ${offset}
        `)

        const dataWithCollaborators = results.map(row => ({
          ...row,
          collaboraters: row.collaboraters ? row.collaboraters.split(',').map(s => s.trim()).filter(Boolean) : []
        }))

        return NextResponse.json({
          page,
          limit,
          offset,
          total,
          totalPages: Math.ceil(total / limit),
          data: dataWithCollaborators
        })
      }

      case 'count': {
        const count = await query(`
          SELECT 
            (SELECT COUNT(*) FROM sponsored_projects) +
            (SELECT COUNT(*) FROM consultancy_projects) AS count
        `)

        return NextResponse.json({ projectCount: count[0].count })
      }

      default: {
        if (depList.has(type)) {
          const dept = depList.get(type)

          const count = await query(`
            SELECT 
              (SELECT COUNT(DISTINCT sp.id) FROM sponsored_projects sp 
               LEFT JOIN sponsored_projects_collaborater spc ON sp.id = spc.sponsored_project_id
               LEFT JOIN user u1 ON u1.email = sp.email 
               LEFT JOIN user u2 ON u2.email = spc.email
               WHERE u1.department = ? OR u2.department = ?) +
              (SELECT COUNT(DISTINCT cp.id) FROM consultancy_projects cp 
               LEFT JOIN consultancy_projects_collaborater cpc ON cp.id = cpc.consultancy_projects_id
               LEFT JOIN user u1 ON u1.email = cp.email 
               LEFT JOIN user u2 ON u2.email = cpc.email
               WHERE u1.department = ? OR u2.department = ?) AS count
          `, [dept, dept, dept, dept])

          total = Number(count[0].count)

          const results = await query(`
            SELECT * FROM (
              SELECT 
                u.name, u.department, u.designation, u.ext_no, u.research_interest,
                u.academic_responsibility, u.image, u.administration, u.cv,
                u.linkedin, u.google_scholar, u.personal_webpage, u.scopus,
                u.vidwan, u.orcid, u.is_retired, u.retirement_date, u.is_deleted,
                sp.id, sp.email, sp.project_title, sp.funding_agency,
                sp.financial_outlay, sp.investigators, sp.pi_institute,
                sp.status, sp.funds_received, sp.role,
                sp.start_date, sp.end_date,
                GROUP_CONCAT(DISTINCT spc.email) AS collaboraters,
                'sponsored' AS project_type, sp.end_date AS sort_date
              FROM sponsored_projects sp
              JOIN user u ON u.email = sp.email
              LEFT JOIN sponsored_projects_collaborater spc ON sp.id = spc.sponsored_project_id
              WHERE sp.email IN (SELECT email FROM user WHERE department = ?)
                 OR sp.id IN (SELECT sponsored_project_id FROM sponsored_projects_collaborater spc2 JOIN user u2 ON u2.email = spc2.email WHERE u2.department = ?)
              GROUP BY sp.id

              UNION ALL

              SELECT 
                u.name, u.department, u.designation, u.ext_no, u.research_interest,
                u.academic_responsibility, u.image, u.administration, u.cv,
                u.linkedin, u.google_scholar, u.personal_webpage, u.scopus,
                u.vidwan, u.orcid, u.is_retired, u.retirement_date, u.is_deleted,
                cp.id, cp.email, cp.project_title, cp.funding_agency,
                cp.financial_outlay, cp.investigators, NULL AS pi_institute,
                cp.status, NULL AS funds_received, cp.role,
                cp.start_date, NULL AS end_date,
                GROUP_CONCAT(DISTINCT cpc.email) AS collaboraters,
                'consultancy' AS project_type, cp.start_date AS sort_date
              FROM consultancy_projects cp
              JOIN user u ON u.email = cp.email
              LEFT JOIN consultancy_projects_collaborater cpc ON cp.id = cpc.consultancy_projects_id
              WHERE cp.email IN (SELECT email FROM user WHERE department = ?)
                 OR cp.id IN (SELECT consultancy_projects_id FROM consultancy_projects_collaborater cpc2 JOIN user u2 ON u2.email = cpc2.email WHERE u2.department = ?)
              GROUP BY cp.id
            ) AS combined
            ORDER BY sort_date DESC
            LIMIT ${limit} OFFSET ${offset}
          `, [dept, dept, dept, dept])

          const dataWithCollaborators = results.map(row => ({
            ...row,
            collaboraters: row.collaboraters ? row.collaboraters.split(',').map(s => s.trim()).filter(Boolean) : []
          }))

          return NextResponse.json({
            page,
            limit,
            offset,
            total,
            totalPages: Math.ceil(total / limit),
            data: dataWithCollaborators
          })
        }

        return NextResponse.json(
          { message: 'Invalid type parameter' },
          { status: 400 }
        )
      }
    }

  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { message: error.message },
      { status: 500 }
    )
  }
}