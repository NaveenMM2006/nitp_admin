import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { depList } from '@/lib/const'

// Parses "2026-2025", "2025", or "2025-2026" into { from, to } (from <= to).
// Returns null if not provided / unparsable.
function parseYearRange(raw) {
  if (!raw) return null
  const parts = raw
    .split('-')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n))

  if (parts.length === 0) return null
  if (parts.length === 1) return { from: parts[0], to: parts[0] }

  const from = Math.min(parts[0], parts[1])
  const to = Math.max(parts[0], parts[1])
  return { from, to }
}

// Builds the JOIN + WHERE + params for a single source table.
// yearExpr must be a SQL expression that evaluates to a normalized integer year.
function buildClause(emailCol, yearExpr, dept, yearFilter) {
  const conditions = []
  const params = []
  let join = ''

  if (dept) {
    join = `JOIN user u ON u.email = ${emailCol}`
    conditions.push('u.department = ?')
    params.push(dept)
  }

  if (yearFilter) {
    conditions.push(`${yearExpr} BETWEEN ? AND ?`)
    params.push(yearFilter.from, yearFilter.to)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  return { join, where, params }
}

function buildProjectCountClause(collabTable, collabIdCol, alias, dept, yearFilter) {
  const conditions = []
  const params = []
  let join = ''

  if (dept) {
    join = `
      LEFT JOIN ${collabTable} col ON ${alias}.id = col.${collabIdCol}
      LEFT JOIN user u1 ON u1.email = ${alias}.email
      LEFT JOIN user u2 ON u2.email = col.email
    `
    conditions.push('(u1.department = ? OR u2.department = ?)')
    params.push(dept, dept)
  }

  if (yearFilter) {
    conditions.push(`YEAR(${alias}.start_date) BETWEEN ? AND ?`)
    params.push(yearFilter.from, yearFilter.to)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  return { join, where, params }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)

    const typeParam = searchParams.get('type')
    const type = typeParam || 'all'

    if (type !== 'all' && !depList.has(type)) {
      return NextResponse.json({ message: 'Invalid type parameter' }, { status: 400 })
    }

    const dept = depList.has(type) ? depList.get(type) : null

    const page = Math.max(1, parseInt(searchParams.get('page')) || 1)
    const limit = Math.max(1, Math.min(50, parseInt(searchParams.get('limit')) || 10))
    const offset = (page - 1) * limit
    const yearFilter = parseYearRange(searchParams.get('year'))

    // Normalized year expressions per table (all cast to integer year)
    const YEAR_EXPR = {
      conference: 'CAST(cp.conference_year AS UNSIGNED)',
      journal: 'COALESCE(jp.publication_year, YEAR(jp.publication_date))',
      book_chapter: 'CAST(bc.year AS UNSIGNED)',
      textbook: 'CAST(t.year AS UNSIGNED)',
    }

    const buildUnionQuery = (dept) => {
      const conf = buildClause('cp.email', YEAR_EXPR.conference, dept, yearFilter)
      const jour = buildClause('jp.email', YEAR_EXPR.journal, dept, yearFilter)
      const chap = buildClause('bc.email', YEAR_EXPR.book_chapter, dept, yearFilter)
      const text = buildClause('t.email', YEAR_EXPR.textbook, dept, yearFilter)

      const params = [...conf.params, ...jour.params, ...chap.params, ...text.params]

      const sql = `
      SELECT * FROM (
        SELECT
          cp.id,
          cp.email,
          cp.authors,
          cp.title,
          cp.conference_name,
          cp.location,
          cp.conference_year AS year,
          cp.conference_year,
          cp.conference_type,
          cp.pages,
          cp.indexing,
          cp.foreign_author,
          cp.student_involved,
          cp.doi,
          cp.student_name,
          cp.student_roll_no,
          cp.foreign_author_name,
          cp.foreign_author_country_name,
          cp.foreign_author_institute_name,
          NULL AS journal_name,
          NULL AS journal_quartile,
          NULL AS volume,
          NULL AS publication_year,
          NULL AS publication_date,
          NULL AS chapter_title,
          NULL AS book_title,
          NULL AS publisher,
          NULL AS isbn,
          NULL AS doi_url,
          NULL AS student_details,
          NULL AS nationality_type,
          NULL AS foreign_author_details,
          NULL AS scopus,
          'conference' AS type,
          ${YEAR_EXPR.conference} AS sort_year
        FROM conference_papers cp
        ${conf.join}
        ${conf.where}

        UNION ALL

        SELECT
          jp.id,
          jp.email,
          jp.authors,
          jp.title,
          NULL AS conference_name,
          NULL AS location,
          jp.publication_date AS year,
          NULL AS conference_year,
          NULL AS conference_type,
          jp.pages,
          jp.indexing,
          NULL AS foreign_author,
          jp.student_involved,
          NULL AS doi,
          NULL AS student_name,
          NULL AS student_roll_no,
          NULL AS foreign_author_name,
          NULL AS foreign_author_country_name,
          NULL AS foreign_author_institute_name,
          jp.journal_name,
          jp.journal_quartile,
          jp.volume,
          jp.publication_year,
          jp.publication_date,
          NULL AS chapter_title,
          NULL AS book_title,
          NULL AS publisher,
          NULL AS isbn,
          jp.doi_url,
          jp.student_details,
          jp.nationality_type,
          jp.foreign_author_details,
          NULL AS scopus,
          'journal' AS type,
          ${YEAR_EXPR.journal} AS sort_year
        FROM journal_papers jp
        ${jour.join}
        ${jour.where}

        UNION ALL

        SELECT
          bc.id,
          bc.email,
          bc.authors,
          bc.chapter_title AS title,
          NULL AS conference_name,
          NULL AS location,
          bc.year,
          NULL AS conference_year,
          NULL AS conference_type,
          bc.pages,
          NULL AS indexing,
          NULL AS foreign_author,
          NULL AS student_involved,
          bc.doi,
          NULL AS student_name,
          NULL AS student_roll_no,
          NULL AS foreign_author_name,
          NULL AS foreign_author_country_name,
          NULL AS foreign_author_institute_name,
          NULL AS journal_name,
          NULL AS journal_quartile,
          NULL AS volume,
          bc.year AS publication_year,
          NULL AS publication_date,
          bc.chapter_title,
          bc.book_title,
          bc.publisher,
          bc.isbn,
          NULL AS doi_url,
          NULL AS student_details,
          NULL AS nationality_type,
          NULL AS foreign_author_details,
          bc.scopus,
          'book_chapter' AS type,
          ${YEAR_EXPR.book_chapter} AS sort_year
        FROM book_chapters bc
        ${chap.join}
        ${chap.where}

        UNION ALL

        SELECT
          t.id,
          t.email,
          t.authors,
          t.title,
          NULL AS conference_name,
          NULL AS location,
          t.year,
          NULL AS conference_year,
          NULL AS conference_type,
          NULL AS pages,
          NULL AS indexing,
          NULL AS foreign_author,
          NULL AS student_involved,
          t.doi,
          NULL AS student_name,
          NULL AS student_roll_no,
          NULL AS foreign_author_name,
          NULL AS foreign_author_country_name,
          NULL AS foreign_author_institute_name,
          NULL AS journal_name,
          NULL AS journal_quartile,
          NULL AS volume,
          t.year AS publication_year,
          NULL AS publication_date,
          NULL AS chapter_title,
          t.title AS book_title,
          t.publisher,
          t.isbn,
          NULL AS doi_url,
          NULL AS student_details,
          NULL AS nationality_type,
          NULL AS foreign_author_details,
          t.scopus,
          'textbook' AS type,
          ${YEAR_EXPR.textbook} AS sort_year
        FROM textbooks t
        ${text.join}
        ${text.where}

      ) AS combined
      ORDER BY sort_year DESC
      LIMIT ${limit} OFFSET ${offset}
    `

      return { sql, params }
    }

    const buildCountQuery = (dept) => {
      const conf = buildClause('cp.email', YEAR_EXPR.conference, dept, yearFilter)
      const jour = buildClause('jp.email', YEAR_EXPR.journal, dept, yearFilter)
      const chap = buildClause('bc.email', YEAR_EXPR.book_chapter, dept, yearFilter)
      const text = buildClause('t.email', YEAR_EXPR.textbook, dept, yearFilter)
      const sp = buildProjectCountClause('sponsored_projects_collaborater', 'sponsored_project_id', 'sp', dept, yearFilter)
      const cp = buildProjectCountClause('consultancy_projects_collaborater', 'consultancy_projects_id', 'cp', dept, yearFilter)

      const params = [
        ...conf.params,
        ...jour.params,
        ...chap.params,
        ...text.params,
        ...sp.params,
        ...cp.params,
      ]

      const sql = `
        SELECT
          (SELECT COUNT(*) FROM conference_papers cp ${conf.join} ${conf.where}) AS conference_papers,
          (SELECT COUNT(*) FROM journal_papers jp ${jour.join} ${jour.where}) AS journal_papers,
          (SELECT COUNT(*) FROM book_chapters bc ${chap.join} ${chap.where}) AS book_chapters,
          (SELECT COUNT(*) FROM textbooks t ${text.join} ${text.where}) AS textbooks,
          (SELECT COUNT(DISTINCT sp.id) FROM sponsored_projects sp ${sp.join} ${sp.where}) AS sponsored_projects,
          (SELECT COUNT(DISTINCT cp.id) FROM consultancy_projects cp ${cp.join} ${cp.where}) AS consultancy_projects
      `
      return { sql, params }
    }

    let countRes = []
    try {
      const { sql: countSql, params: countParams } = buildCountQuery(dept)
      countRes = await query(countSql, countParams)
    } catch (countErr) {
      console.error('Stats count query error, using fallback:', countErr)
      try {
        const conf = buildClause('cp.email', YEAR_EXPR.conference, dept, yearFilter)
        const jour = buildClause('jp.email', YEAR_EXPR.journal, dept, yearFilter)
        const chap = buildClause('bc.email', YEAR_EXPR.book_chapter, dept, yearFilter)
        const text = buildClause('t.email', YEAR_EXPR.textbook, dept, yearFilter)
        const pubParams = [...conf.params, ...jour.params, ...chap.params, ...text.params]
        const fallbackSql = `
          SELECT
            (SELECT COUNT(*) FROM conference_papers cp ${conf.join} ${conf.where}) AS conference_papers,
            (SELECT COUNT(*) FROM journal_papers jp ${jour.join} ${jour.where}) AS journal_papers,
            (SELECT COUNT(*) FROM book_chapters bc ${chap.join} ${chap.where}) AS book_chapters,
            (SELECT COUNT(*) FROM textbooks t ${text.join} ${text.where}) AS textbooks
        `
        countRes = await query(fallbackSql, pubParams)
      } catch (e2) {
        console.error('Fallback count error:', e2)
      }
    }

    const journalCount = Number(countRes[0]?.journal_papers || 0)
    const conferenceCount = Number(countRes[0]?.conference_papers || 0)
    const bookChapterCount = Number(countRes[0]?.book_chapters || 0)
    const textbookCount = Number(countRes[0]?.textbooks || 0)
    const sponsoredCount = Number(countRes[0]?.sponsored_projects || 0)
    const consultancyCount = Number(countRes[0]?.consultancy_projects || 0)

    const booksCount = bookChapterCount + textbookCount
    const projectsCount = sponsoredCount + consultancyCount
    const total = conferenceCount + journalCount + bookChapterCount + textbookCount

    const stats = {
      journals: journalCount,
      conferences: conferenceCount,
      books: booksCount,
      projects: projectsCount,
      book_chapters: bookChapterCount,
      textbooks: textbookCount,
      sponsored_projects: sponsoredCount,
      consultancy_projects: consultancyCount,
      total: total,
    }

    const { sql, params } = buildUnionQuery(dept)
    const results = await query(sql, params)
    results.forEach((r) => delete r.sort_year)

    return NextResponse.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      stats,
      data: results,
    })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ message: error.message }, { status: 500 })
  }
}
