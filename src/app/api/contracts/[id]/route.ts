import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CONTRACT_INCLUDE, buildContractData } from '@/lib/contractData'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const item = await prisma.contract.findUnique({
      where: { id: parseInt(id) },
      include: CONTRACT_INCLUDE,
    })
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(item)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const item = await prisma.contract.update({
      where: { id: parseInt(id) },
      data: buildContractData(body, 'update'),
      include: CONTRACT_INCLUDE,
    })
    return NextResponse.json(item)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.contract.delete({ where: { id: parseInt(id) } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
