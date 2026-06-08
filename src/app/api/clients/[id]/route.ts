import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requirePermission, assertRowAccess } from '@/lib/permissions'
import { CUSTOMER_INCLUDE, buildCustomerData, assertCustomerUnique } from '@/lib/clientData'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('CUSTOMER', 'VIEW')
    const { id } = await params
    const item = await prisma.customer.findUnique({
      where: { id: parseInt(id) },
      include: {
        ...CUSTOMER_INCLUDE,
        createdBy: { select: { id: true, name: true, departmentId: true, department: { select: { name: true } } } },
      },
    })
    await assertRowAccess(user, item, 'CUSTOMER', 'view')
    return NextResponse.json(item)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('CUSTOMER', 'EDIT')
    const { id } = await params
    const existing = await prisma.customer.findUnique({
      where: { id: parseInt(id) },
      select: { createdById: true, createdBy: { select: { departmentId: true } } },
    })
    await assertRowAccess(user, existing, 'CUSTOMER', 'write')
    const body = await req.json()
    const data = buildCustomerData(body, 'update')
    await assertCustomerUnique(data, parseInt(id))
    const item = await prisma.customer.update({
      where: { id: parseInt(id) },
      data: { ...data, updatedById: user.id },
      include: CUSTOMER_INCLUDE,
    })
    return NextResponse.json(item)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('CUSTOMER', 'DELETE')
    const { id } = await params
    const existing = await prisma.customer.findUnique({
      where: { id: parseInt(id) },
      select: { createdById: true, createdBy: { select: { departmentId: true } } },
    })
    await assertRowAccess(user, existing, 'CUSTOMER', 'write')
    await prisma.customer.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
