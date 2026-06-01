import { ShieldCheck } from 'lucide-react'

export default function PermissionsPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-base-content">权限设置</h1>
        <p className="mt-0.5 text-sm text-base-content/50">配置用户与部门的资源访问权限</p>
      </div>

      <div className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body items-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <h2 className="mt-2 text-lg font-semibold text-base-content">权限管理功能开发中</h2>
          <p className="max-w-md text-sm text-base-content/50">
            该模块用于为用户或部门配置对各资源的增删改查权限，敬请期待。
          </p>
        </div>
      </div>
    </div>
  )
}
