/**
 * Reads /tmp/booster-testdata/attachments.json and applies attachment URL
 * updates to the local dev DB via Prisma.
 *
 * Run from project root:
 *   npx tsx --env-file=.env scripts/apply-attachments.ts
 */

import fs from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new PrismaClient({ adapter } as any)

const JSON_PATH = '/tmp/booster-testdata/attachments.json'

interface BaseMapping {
  model: string
  field: string
  url: string
}
interface CustomerMapping extends BaseMapping {
  model: 'customer'
  matchName: string
}
interface RequirementMapping extends BaseMapping {
  model: 'requirement'
  matchPositionName: string
  matchCustomerName: string
}
interface CandidateMapping extends BaseMapping {
  model: 'candidate'
  matchName: string
}
type Mapping = CustomerMapping | RequirementMapping | CandidateMapping

async function main() {
  const raw = fs.readFileSync(JSON_PATH, 'utf-8')
  const mappings: Mapping[] = JSON.parse(raw)

  console.log(`Loaded ${mappings.length} mappings from ${JSON_PATH}\n`)

  let customerOk = 0, customerMiss = 0
  let requirementOk = 0, requirementMiss = 0
  let candidateOk = 0, candidateMiss = 0

  for (const m of mappings) {
    if (m.model === 'customer') {
      const rec = await prisma.customer.findFirst({
        where: { fullName: m.matchName },
        select: { id: true },
      })
      if (!rec) {
        console.log(`  [MISS] customer not found: "${m.matchName}"`)
        customerMiss++
        continue
      }
      await prisma.customer.update({
        where: { id: rec.id },
        data: { attachmentUrl: m.url ? [m.url] : [] },
      })
      console.log(`  [OK] customer id=${rec.id} "${m.matchName}"  →  ${m.url}`)
      customerOk++

    } else if (m.model === 'requirement') {
      // First resolve the customer
      const cust = await prisma.customer.findFirst({
        where: { fullName: m.matchCustomerName },
        select: { id: true },
      })
      if (!cust) {
        console.log(`  [MISS] customer for requirement not found: "${m.matchCustomerName}"`)
        requirementMiss++
        continue
      }
      const req = await prisma.requirement.findFirst({
        where: { positionName: m.matchPositionName, customerId: cust.id },
        select: { id: true },
      })
      if (!req) {
        console.log(`  [MISS] requirement not found: "${m.matchPositionName}" @ "${m.matchCustomerName}"`)
        requirementMiss++
        continue
      }
      await prisma.requirement.update({
        where: { id: req.id },
        data: { attachmentUrl: m.url ? [m.url] : [] },
      })
      console.log(`  [OK] requirement id=${req.id} "${m.matchPositionName}" @ "${m.matchCustomerName}"  →  ${m.url}`)
      requirementOk++

    } else if (m.model === 'candidate') {
      const rec = await prisma.candidate.findFirst({
        where: { name: m.matchName },
        select: { id: true },
      })
      if (!rec) {
        console.log(`  [MISS] candidate not found: "${m.matchName}"`)
        candidateMiss++
        continue
      }
      const data: Record<string, string> = {}
      data[m.field] = m.url
      await prisma.candidate.update({
        where: { id: rec.id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: data as any,
      })
      console.log(`  [OK] candidate id=${rec.id} "${m.matchName}"  →  ${m.field} = ${m.url}`)
      candidateOk++
    }
  }

  console.log('\n=== Summary ===')
  console.log(`Customer:     ${customerOk} updated, ${customerMiss} not found`)
  console.log(`Requirement:  ${requirementOk} updated, ${requirementMiss} not found`)
  console.log(`Candidate:    ${candidateOk} updated, ${candidateMiss} not found`)

  await prisma.$disconnect()
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
