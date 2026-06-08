import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requirePermission, assertRowAccess } from '@/lib/permissions'
import { SUPPLEMENT_INCLUDE, buildSupplementData } from '@/lib/supplementData'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('CLIENT_SUPPLEMENT', 'VIEW')
    const { id } = await params
    const item = await prisma.clientSupplement.findUnique({
      where: { id: parseInt(id) },
      include: {
        ...SUPPLEMENT_INCLUDE,
        createdBy: { select: { id: true, name: true, departmentId: true, department: { select: { name: true } } } },
      },
    })
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await assertRowAccess(user, item, 'CLIENT_SUPPLEMENT', 'view')
    return NextResponse.json(item)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('CLIENT_SUPPLEMENT', 'EDIT')
    const { id } = await params
    const existing = await prisma.clientSupplement.findUnique({
      where: { id: parseInt(id) },
      select: { createdById: true, createdBy: { select: { departmentId: true } } },
    })
    await assertRowAccess(user, existing, 'CLIENT_SUPPLEMENT', 'write')
    const body = await req.json()
    const item = await prisma.clientSupplement.update({
      where: { id: parseInt(id) },
      data: buildSupplementData(body, 'update'),
      include: SUPPLEMENT_INCLUDE,
    })
    return NextResponse.json(item)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('CLIENT_SUPPLEMENT', 'DELETE')
    const { id } = await params
    const existing = await prisma.clientSupplement.findUnique({
      where: { id: parseInt(id) },
      select: { createdById: true, createdBy: { select: { departmentId: true } } },
    })
    await assertRowAccess(user, existing, 'CLIENT_SUPPLEMENT', 'write')
    await prisma.clientSupplement.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
