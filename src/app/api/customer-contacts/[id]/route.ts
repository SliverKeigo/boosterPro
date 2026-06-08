import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requirePermission, assertRowAccess } from '@/lib/permissions'
import { CUSTOMER_CONTACT_INCLUDE, buildCustomerContactData } from '@/lib/customerContactData'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('CUSTOMER_CONTACT', 'VIEW')
    const { id } = await params
    const item = await prisma.customerContact.findUnique({
      where: { id: parseInt(id) },
      include: {
        ...CUSTOMER_CONTACT_INCLUDE,
        createdBy: { select: { id: true, name: true, departmentId: true, department: { select: { name: true } } } },
      },
    })
    await assertRowAccess(user, item, 'CUSTOMER_CONTACT', 'view')
    return NextResponse.json(item)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('CUSTOMER_CONTACT', 'EDIT')
    const { id } = await params
    const existing = await prisma.customerContact.findUnique({
      where: { id: parseInt(id) },
      select: { createdById: true, createdBy: { select: { departmentId: true } } },
    })
    await assertRowAccess(user, existing, 'CUSTOMER_CONTACT', 'write')
    const body = await req.json()
    const item = await prisma.customerContact.update({
      where: { id: parseInt(id) },
      data: buildCustomerContactData(body, 'update'),
      include: CUSTOMER_CONTACT_INCLUDE,
    })
    return NextResponse.json(item)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('CUSTOMER_CONTACT', 'DELETE')
    const { id } = await params
    const existing = await prisma.customerContact.findUnique({
      where: { id: parseInt(id) },
      select: { createdById: true, createdBy: { select: { departmentId: true } } },
    })
    await assertRowAccess(user, existing, 'CUSTOMER_CONTACT', 'write')
    await prisma.customerContact.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
