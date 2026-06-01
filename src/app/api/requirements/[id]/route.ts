import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { REQUIREMENT_INCLUDE, buildRequirementData } from '@/lib/requirementData'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const item = await prisma.requirement.findUnique({
      where: { id: parseInt(id) },
      include: REQUIREMENT_INCLUDE,
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
    const { id } = await params
    await prisma.requirement.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleApiError(e)
  }
}
