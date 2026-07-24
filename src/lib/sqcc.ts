import { randomUUID } from 'crypto'
import { prisma } from './prisma'

const createId = () => randomUUID().replace(/-/g, '')

const SQCC_API = 'https://seedapi.sqcc.gov.np/api/cropvarieties/'

interface SqccRaw {
  id: number
  name: string
  nepname: string | null
  croptypename: string
  croptypeslug: string
  owner_type: string
  narc_variety: boolean
  type_op_hybrid: string | null
  is_registered: boolean
  released_date: string | null
  released_fiscal_year: number | null
  recommended_areas: string | null
  slug: string | null
  is_deleted: boolean
}

// SQCC's own data has a stray "nan" string in a handful of type_op_hybrid values
// (source data quality issue, not a null) — normalize it to null like the rest.
function cleanType(t: string | null): string | null {
  if (!t || t.toLowerCase() === 'nan') return null
  return t
}

const CHUNK_SIZE = 400

export async function syncSqccVarieties(): Promise<{ total: number; crops: number }> {
  const res = await fetch(SQCC_API, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TarkariBot/1.0)' },
    signal: AbortSignal.timeout(30000),
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`SQCC fetch failed: ${res.status}`)
  const raw: SqccRaw[] = await res.json()
  const rows = raw.filter((r) => !r.is_deleted)

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE)
    const cols = 14
    const values = chunk
      .map(
        (_, j) =>
          `($${j * cols + 1}, $${j * cols + 2}, $${j * cols + 3}, $${j * cols + 4}, $${j * cols + 5}, $${j * cols + 6}, $${j * cols + 7}, $${j * cols + 8}, $${j * cols + 9}, $${j * cols + 10}, $${j * cols + 11}::date, $${j * cols + 12}, $${j * cols + 13}, $${j * cols + 14}, now(), now())`
      )
      .join(',')
    const params = chunk.flatMap((r) => [
      createId(),
      r.id,
      r.name,
      r.nepname,
      r.croptypename,
      r.croptypeslug,
      r.owner_type,
      r.narc_variety,
      cleanType(r.type_op_hybrid),
      r.is_registered,
      r.released_date,
      r.released_fiscal_year,
      r.recommended_areas,
      r.slug,
    ])

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "SeedVariety"
        (id, "sqccId", name, "nepName", "cropName", "cropSlug", "ownerType", "narcVariety", "typeOpHybrid", "isRegistered", "releasedDate", "releasedFiscalYear", "recommendedAreas", slug, "createdAt", "updatedAt")
      VALUES ${values}
      ON CONFLICT ("sqccId") DO UPDATE SET
        name = EXCLUDED.name,
        "nepName" = EXCLUDED."nepName",
        "cropName" = EXCLUDED."cropName",
        "cropSlug" = EXCLUDED."cropSlug",
        "ownerType" = EXCLUDED."ownerType",
        "narcVariety" = EXCLUDED."narcVariety",
        "typeOpHybrid" = EXCLUDED."typeOpHybrid",
        "isRegistered" = EXCLUDED."isRegistered",
        "releasedDate" = EXCLUDED."releasedDate",
        "releasedFiscalYear" = EXCLUDED."releasedFiscalYear",
        "recommendedAreas" = EXCLUDED."recommendedAreas",
        slug = EXCLUDED.slug,
        "updatedAt" = now()
      `,
      ...params
    )
  }

  const crops = new Set(rows.map((r) => r.croptypeslug)).size
  return { total: rows.length, crops }
}
