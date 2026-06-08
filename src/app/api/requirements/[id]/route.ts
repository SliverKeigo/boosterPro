import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requirePermission, assertRowAccess } from '@/lib/permissions'
import { REQUIREMENT_INCLUDE, buildRequirementData } from '@/lib/requirementData'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('REQUIREMENT', 'VIEW')
    const { id } = await params
    const item = await prisma.requirement.findUnique({
      where: { id: parseInt(id) },
      include: {
        ...REQUIREMENT_INCLUDE,
        createdBy: { select: { id: true, name: true, departmentId: true, department: { select: { name: true } } } },
      },
    })
    await assertRowAccess(user, item, 'REQUIREMENT', 'view')
    return NextResponse.json(item)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('REQUIREMENT', 'EDIT')
    const { id } = await params
    const existing = await prisma.requirement.findUnique({
      where: { id: parseInt(id) },
      select: { createdById: true, createdBy: { select: { departmentId: true } } },
    })
    await assertRowAccess(user, existing, 'REQUIREMENT', 'write')
    const body = await req.json()
    const item = await prisma.requirement.update({
      where: { id: parseInt(id) },
      data: buildRequirementData(body, 'update'),
      include: REQUIREMENT_INCLUDE,
    })
    return NextResponse.json(item)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('REQUIREMENT', 'DELETE')
    const { id } = await params
    const existing = await prisma.requirement.findUnique({
      where: { id: parseInt(id) },
      select: { createdById: true, createdBy: { select: { departmentId: true } } },
    })
    await assertRowAccess(user, existing, 'REQUIREMENT', 'write')
    await prisma.requirement.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
