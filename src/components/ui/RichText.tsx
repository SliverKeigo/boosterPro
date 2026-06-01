'use client'

import dynamic from 'next/dynamic'
import 'react-quill-new/dist/quill.snow.css'

const ReactQuill = dynamic(() => import('react-quill-new'), {
  ssr: false,
  loading: () => <div className="h-32 animate-pulse rounded-lg bg-base-200" />,
})

interface RichTextProps {
  value?: string
  onChange: (html: string) => void
  placeholder?: string
}

const MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ color: [] }, { background: [] }],
    ['link', 'clean'],
  ],
}

/** 富文本编辑器（对应文档中带工具栏的富文本字段，如企业文化福利、知识便条），内容以 HTML 字符串存储 */
export function RichText({ value, onChange, placeholder }: RichTextProps) {
  return (
    <div className="bp-richtext">
      <ReactQuill
        theme="snow"
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        modules={MODULES}
      />
    </div>
  )
}
