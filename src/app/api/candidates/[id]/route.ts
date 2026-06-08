import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requirePermission, assertRowWritable } from '@/lib/permissions'
import { CANDIDATE_INCLUDE, buildCandidateData, assertCandidateUnique } from '@/lib/candidateData'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('CANDIDATE', 'VIEW')
    const { id } = await params
    const item = await prisma.candidate.findUnique({
      where: { id: parseInt(id) },
      include: CANDIDATE_INCLUDE,
    })
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(item)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('CANDIDATE', 'EDIT')
    const { id } = await params
    const existing = await prisma.candidate.findUnique({
      where: { id: parseInt(id) },
      select: { createdById: true },
    })
    assertRowWritable(user, existing)
    const body = await req.json()
    const data = buildCandidateData(body, 'update')
    await assertCandidateUnique(data, parseInt(id))
    const item = await prisma.candidate.update({
      where: { id: parseInt(id) },
      data,
      include: CANDIDATE_INCLUDE,
    })
    return NextResponse.json(item)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('CANDIDATE', 'DELETE')
    const { id } = await params
    const existing = await prisma.candidate.findUnique({
      where: { id: parseInt(id) },
      select: { createdById: true },
    })
    assertRowWritable(user, existing)
    await prisma.candidate.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
