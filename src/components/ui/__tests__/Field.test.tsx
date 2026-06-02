// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Field } from '@/components/ui/Field'

describe('Field', () => {
  it('渲染 label 与 children', () => {
    render(
      <Field label="姓名">
        <input aria-label="name-input" />
      </Field>,
    )
    expect(screen.getByText('姓名')).toBeInTheDocument()
    expect(screen.getByLabelText('name-input')).toBeInTheDocument()
  })

  it('required 时显示必填星号', () => {
    const { container } = render(
      <Field label="手机号" required>
        <input />
      </Field>,
    )
    const star = container.querySelector('.text-error')
    expect(star).toBeInTheDocument()
    expect(star).toHaveTextContent('*')
  })

  it('不传 required 时不显示星号', () => {
    const { container } = render(
      <Field label="备注">
        <input />
      </Field>,
    )
    expect(container.querySelector('.text-error')).toBeNull()
  })

  it('error 存在时显示错误信息', () => {
    render(
      <Field label="邮箱" error="邮箱格式不正确">
        <input />
      </Field>,
    )
    expect(screen.getByText('邮箱格式不正确')).toBeInTheDocument()
  })

  it('没有 error 时不渲染错误信息', () => {
    render(
      <Field label="邮箱">
        <input />
      </Field>,
    )
    expect(screen.queryByText('邮箱格式不正确')).toBeNull()
  })

  it('附加 className 到根容器', () => {
    const { container } = render(
      <Field label="字段" className="custom-cls">
        <input />
      </Field>,
    )
    expect(container.firstChild).toHaveClass('custom-cls')
  })
})
