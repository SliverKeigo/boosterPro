import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requirePermission, assertRowAccess } from '@/lib/permissions'
import { CONTRACT_INCLUDE, buildContractData } from '@/lib/contractData'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('CONTRACT', 'VIEW')
    const { id } = await params
    const item = await prisma.contract.findUnique({
      where: { id: parseInt(id) },
      include: { ...CONTRACT_INCLUDE, createdBy: { select: { departmentId: true } } },
    })
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await assertRowAccess(user, item, 'CONTRACT', 'view')
    return NextResponse.json(item)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('CONTRACT', 'EDIT')
    const { id } = await params
    const existing = await prisma.contract.findUnique({
      where: { id: parseInt(id) },
      select: { createdById: true, createdBy: { select: { departmentId: true } } },
    })
    await assertRowAccess(user, existing, 'CONTRACT', 'write')
    const body = await req.json()
    const item = await prisma.contract.update({
      where: { id: parseInt(id) },
      data: buildContractData(body, 'update'),
      include: CONTRACT_INCLUDE,
    })
    return NextResponse.json(item)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('CONTRACT', 'DELETE')
    const { id } = await params
    const existing = await prisma.contract.findUnique({
      where: { id: parseInt(id) },
      select: { createdById: true, createdBy: { select: { departmentId: true } } },
    })
    await assertRowAccess(user, existing, 'CONTRACT', 'write')
    await prisma.contract.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
