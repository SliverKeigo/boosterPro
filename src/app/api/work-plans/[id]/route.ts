import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'

const WORK_PLAN_INCLUDE = {
  owner: { select: { id: true, name: true } },
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildData(body: any) {
  const { owner, _count, id, createdAt, updatedAt, ...rest } = body
  void owner
  void _count
  void id
  void createdAt
  void updatedAt
  const data: any = { ...rest }
  data.startDate = data.startDate ? new Date(data.startDate) : null
  data.endDate = data.endDate ? new Date(data.endDate) : null
  if (data.ownerId === '' || data.ownerId === undefined) data.ownerId = null
  else if (data.ownerId !== null) data.ownerId = Number(data.ownerId)
  return data
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const item = await prisma.workPlan.findUnique({
      where: { id: parseInt(id) },
      include: WORK_PLAN_INCLUDE,
    })
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(item)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const item = await prisma.workPlan.update({
      where: { id: parseInt(id) },
      data: buildData(body),
      include: WORK_PLAN_INCLUDE,
    })
    return NextResponse.json(item)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.workPlan.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
