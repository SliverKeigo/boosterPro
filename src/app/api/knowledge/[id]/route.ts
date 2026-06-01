import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { KNOWLEDGE_INCLUDE, buildKnowledgeData } from '@/lib/knowledgeData'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const item = await prisma.knowledgeBase.findUnique({
      where: { id: parseInt(id) },
      include: KNOWLEDGE_INCLUDE,
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
    const item = await prisma.knowledgeBase.update({
      where: { id: parseInt(id) },
      data: buildKnowledgeData(body, 'update'),
      include: KNOWLEDGE_INCLUDE,
    })
    return NextResponse.json(item)
  } catch (e) {
    return handleApiError(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.knowledgeBase.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
