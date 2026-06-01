import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requirePermission, assertRowWritable } from '@/lib/permissions'
import { OPPORTUNITY_INCLUDE, buildOpportunityData } from '@/lib/opportunityData'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('OPPORTUNITY', 'VIEW')
    const { id } = await params
    const item = await prisma.opportunity.findUnique({
      where: { id: parseInt(id) },
      include: OPPORTUNITY_INCLUDE,
    })
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(item)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('OPPORTUNITY', 'EDIT')
    const { id } = await params
    const existing = await prisma.opportunity.findUnique({
      where: { id: parseInt(id) },
      select: { createdById: true },
    })
    assertRowWritable(user, existing)
    const body = await req.json()
    const item = await prisma.opportunity.update({
      where: { id: parseInt(id) },
      data: buildOpportunityData(body, 'update'),
      include: OPPORTUNITY_INCLUDE,
    })
    return NextResponse.json(item)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('OPPORTUNITY', 'DELETE')
    const { id } = await params
    const existing = await prisma.opportunity.findUnique({
      where: { id: parseInt(id) },
      select: { createdById: true },
    })
    assertRowWritable(user, existing)
    await prisma.opportunity.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
