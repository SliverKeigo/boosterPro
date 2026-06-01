import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requirePermission, assertRowWritable } from '@/lib/permissions'
import { CUSTOMER_INCLUDE, buildCustomerData } from '@/lib/clientData'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('CUSTOMER', 'VIEW')
    const { id } = await params
    const item = await prisma.customer.findUnique({
      where: { id: parseInt(id) },
      include: CUSTOMER_INCLUDE,
    })
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
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
      select: { createdById: true },
    })
    assertRowWritable(user, existing)
    const body = await req.json()
    const item = await prisma.customer.update({
      where: { id: parseInt(id) },
      data: buildCustomerData(body, 'update'),
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
      select: { createdById: true },
    })
    assertRowWritable(user, existing)
    await prisma.customer.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
