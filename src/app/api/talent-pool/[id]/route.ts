import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requirePermission, assertRowAccess } from '@/lib/permissions'
import { buildTalentPoolData } from '@/lib/talentPoolData'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission('TALENT_POOL', 'VIEW')
    const { id } = await params
    const item = await prisma.talentPool.findUnique({
      where: { id: parseInt(id) },
      include: { createdBy: { select: { departmentId: true } }, updatedBy: { select: { id: true, name: true } } },
    })
    await assertRowAccess(user, item, 'TALENT_POOL', 'view')
    return NextResponse.json(item)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission('TALENT_POOL', 'EDIT')
    const { id } = await params
    const existing = await prisma.talentPool.findUnique({
      where: { id: parseInt(id) },
      select: { createdById: true, createdBy: { select: { departmentId: true } } },
    })
    await assertRowAccess(user, existing, 'TALENT_POOL', 'write')
    const body = await req.json()
    const item = await prisma.talentPool.update({
      where: { id: parseInt(id) },
      data: { ...buildTalentPoolData(body), updatedById: user.id },
    })
    return NextResponse.json(item)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission('TALENT_POOL', 'DELETE')
    const { id } = await params
    const existing = await prisma.talentPool.findUnique({
      where: { id: parseInt(id) },
      select: { createdById: true, createdBy: { select: { departmentId: true } } },
    })
    await assertRowAccess(user, existing, 'TALENT_POOL', 'write')
    await prisma.talentPool.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
