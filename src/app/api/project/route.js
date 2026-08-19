import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { depList } from '@/lib/const'

// Parses "2020-2021" into a July 1 2020 – June 30 2021 date range, matching
// the frontend's getAcademicYear() logic (month >= 7 belongs to the year
// that starts that July).
function parseAcademicYearRange(raw) {
  if (!raw) return null
  const match = raw.match(/^(\d{4})-(\d{4})$/)
  if (!match) return null

  const startYear = parseInt(match[1], 10)
  const endYear = parseInt(match[2], 10)
  if (endYear !== startYear + 1) return null

  return {
    from: `${startYear}-07-01`,
    to: `${endYear}-06-30`,
  }
}

// Builds JOIN + WHERE + params for one source table (sponsored_projects or
// consultancy_projects), given whichever filters are active.
function buildClause({ tableAlias, emailCol, dept, academicYearRange, status, search }) {
  const conditions = []
  const params = []
  let join = ''

  if (dept) {
    join = `JOIN user u ON u.email = ${emailCol}`
    conditions.push('u.department = ?')
    params.push(dept)
  }

  if (academicYearRange) {
    conditions.push(`${tableAlias}.start_date BETWEEN ? AND ?`)
    params.push(academicYearRange.from, academicYearRange.to)
  }

  if (status) {
    conditions.push(`${tableAlias}.status = ?`)
    params.push(status)
  }

  if (search) {
    const term = `%${search}%`
    conditions.push(`(
      ${tableAlias}.project_title LIKE ? OR
      ${tableAlias}.funding_agency LIKE ? OR
      ${tableAlias}.investigators LIKE ? OR
      ${tableAlias}.email LIKE ?
    )`)
    params.push(term, term, term, term)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  return { join, where, params }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)

    const type = searchParams.get('type')
    const page = Math.max(1, parseInt(searchParams.get('page')) || 1)
    const limit = Math.min(50, parseInt(searchParams.get('limit')) || 20)
    const offset = (page - 1) * limit

    const academicYearRange = parseAcademicYearRange(searchParams.get('academic_year'))
    const status = searchParams.get('status') || null
    const search = searchParams.get('search') || null

    let total = 0

    switch (type) {
      case 'all': {
        const sp = buildClause({
          tableAlias: 'sp', emailCol: 'sp.email', dept: null,
          academicYearRange, status, search,
        })
        const cp = buildClause({
          tableAlias: 'cp', emailCol: 'cp.email', dept: null,
          academicYearRange, status, search,
        })

        const countRes = await query(
          `SELECT
            (SELECT COUNT(*) FROM sponsored_projects sp ${sp.where}) +
            (SELECT COUNT(*) FROM consultancy_projects cp ${cp.where}) AS count`,
          [...sp.params, ...cp.params]
        )
        total = Number(countRes[0].count)

        const results = await query(
          `SELECT * FROM (
            SELECT
              id, email, project_title, funding_agency,
              financial_outlay, investigators, pi_institute,
              status, funds_received, role,
              start_date, end_date,
              'sponsored' AS project_type, end_date AS sort_date
            FROM sponsored_projects sp
            ${sp.where}

            UNION ALL

            SELECT
              id, email, project_title, funding_agency,
              financial_outlay, investigators, NULL AS pi_institute,
              status, NULL AS funds_received, role,
              start_date, NULL AS end_date,
              'consultancy' AS project_type, start_date AS sort_date
            FROM consultancy_projects cp
            ${cp.where}
          ) AS combined
          ORDER BY sort_date DESC
          LIMIT ${limit} OFFSET ${offset}`,
          [...sp.params, ...cp.params]
        )

        return NextResponse.json({
          page,
          limit,
          offset,
          total,
          totalPages: Math.ceil(total / limit),
          data: results
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

          const sp = buildClause({
            tableAlias: 'sp', emailCol: 'sp.email', dept,
            academicYearRange, status, search,
          })
          const cp = buildClause({
            tableAlias: 'cp', emailCol: 'cp.email', dept,
            academicYearRange, status, search,
          })

          const countRes = await query(
            `SELECT
              (SELECT COUNT(*) FROM sponsored_projects sp ${sp.join} ${sp.where}) +
              (SELECT COUNT(*) FROM consultancy_projects cp ${cp.join} ${cp.where}) AS count`,
            [...sp.params, ...cp.params]
          )
          total = Number(countRes[0].count)

          const results = await query(
            `SELECT * FROM (
              SELECT
                u.name, u.department, u.designation, u.ext_no, u.research_interest,
                u.academic_responsibility, u.image, u.administration, u.cv,
                u.linkedin, u.google_scholar, u.personal_webpage, u.scopus,
                u.vidwan, u.orcid, u.is_retired, u.retirement_date, u.is_deleted,
                sp.id, sp.email, sp.project_title, sp.funding_agency,
                sp.financial_outlay, sp.investigators, sp.pi_institute,
                sp.status, sp.funds_received, sp.role,
                sp.start_date, sp.end_date,
                'sponsored' AS project_type, sp.end_date AS sort_date
              FROM sponsored_projects sp
              ${sp.join}
              ${sp.where}

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
                'consultancy' AS project_type, cp.start_date AS sort_date
              FROM consultancy_projects cp
              ${cp.join}
              ${cp.where}
            ) AS combined
            ORDER BY sort_date DESC
            LIMIT ${limit} OFFSET ${offset}`,
            [...sp.params, ...cp.params]
          )

          return NextResponse.json({
            page,
            limit,
            offset,
            total,
            totalPages: Math.ceil(total / limit),
            data: results
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