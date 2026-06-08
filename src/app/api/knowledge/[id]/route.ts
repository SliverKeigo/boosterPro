import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requirePermission, assertRowAccess } from '@/lib/permissions'
import { KNOWLEDGE_INCLUDE, buildKnowledgeData } from '@/lib/knowledgeData'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('KNOWLEDGE', 'VIEW')
    const { id } = await params
    const item = await prisma.knowledgeBase.findUnique({
      where: { id: parseInt(id) },
      include: {
        ...KNOWLEDGE_INCLUDE,
        createdBy: { select: { id: true, name: true, departmentId: true, department: { select: { name: true } } } },
      },
    })
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await assertRowAccess(user, item, 'KNOWLEDGE', 'view')
    return NextResponse.json(item)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('KNOWLEDGE', 'EDIT')
    const { id } = await params
    const existing = await prisma.knowledgeBase.findUnique({
      where: { id: parseInt(id) },
      select: { createdById: true, createdBy: { select: { departmentId: true } } },
    })
    await assertRowAccess(user, existing, 'KNOWLEDGE', 'write')
    const body = await req.json()
    const item = await prisma.knowledgeBase.update({
      where: { id: parseInt(id) },
      data: { ...buildKnowledgeData(body, 'update'), updatedById: user.id },
      include: KNOWLEDGE_INCLUDE,
    })
    return NextResponse.json(item)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('KNOWLEDGE', 'DELETE')
    const { id } = await params
    const existing = await prisma.knowledgeBase.findUnique({
      where: { id: parseInt(id) },
      select: { createdById: true, createdBy: { select: { departmentId: true } } },
    })
    await assertRowAccess(user, existing, 'KNOWLEDGE', 'write')
    await prisma.knowledgeBase.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
