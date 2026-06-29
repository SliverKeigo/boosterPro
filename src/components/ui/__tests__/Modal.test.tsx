// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from '@/components/ui/Modal'

describe('Modal', () => {
  it('open=false 时不渲染任何内容', () => {
    render(
      <Modal open={false} onClose={() => {}} title="标题">
        <div>正文</div>
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('正文')).toBeNull()
  })

  it('open=true 时渲染 title 与 children', () => {
    render(
      <Modal open onClose={() => {}} title="编辑候选人">
        <div>表单正文</div>
      </Modal>,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('编辑候选人')).toBeInTheDocument()
    expect(screen.getByText('表单正文')).toBeInTheDocument()
  })

  it('点击关闭按钮触发 onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="标题">
        <div>正文</div>
      </Modal>,
    )
    await user.click(screen.getByLabelText('关闭'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('点击确定按钮触发 onOk', async () => {
    const user = userEvent.setup()
    const onOk = vi.fn()
    render(
      <Modal open onClose={() => {}} onOk={onOk} title="标题">
        <div>正文</div>
      </Modal>,
    )
    await user.click(screen.getByRole('button', { name: '确定' }))
    expect(onOk).toHaveBeenCalledTimes(1)
  })

  it('confirmLoading 时禁用确定按钮', () => {
    render(
      <Modal open onClose={() => {}} onOk={() => {}} title="标题" confirmLoading>
        <div>正文</div>
      </Modal>,
    )
    expect(screen.getByRole('button', { name: '确定' })).toBeDisabled()
  })

  it('自定义 okText / cancelText', () => {
    render(
      <Modal open onClose={() => {}} onOk={() => {}} title="标题" okText="保存" cancelText="返回">
        <div>正文</div>
      </Modal>,
    )
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '返回' })).toBeInTheDocument()
  })

  it('footer=null 时隐藏底部操作栏', () => {
    render(
      <Modal open onClose={() => {}} onOk={() => {}} title="标题" footer={null}>
        <div>正文</div>
      </Modal>,
    )
    expect(screen.queryByRole('button', { name: '确定' })).toBeNull()
  })

  it('点击遮罩层（背景）不关闭——必须点 X / 关闭按钮，避免误点丢数据', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="标题">
        <div>正文</div>
      </Modal>,
    )
    // 点遮罩(modal 外面)不再触发 onClose（防止填表误点外面丢数据）
    const dialog = screen.getByRole('dialog')
    const overlay = dialog.parentElement as HTMLElement
    fireEvent.mouseDown(overlay)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('按 ESC 触发 onClose', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="标题">
        <div>正文</div>
      </Modal>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
