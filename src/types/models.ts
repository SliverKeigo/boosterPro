/**
 * boosterPro 业务模型类型定义（集中再导出 + 复合类型）
 * ============================================================================
 *
 * 【为什么不需要手写 Record / 实体类？】
 * Prisma 在 `npx prisma generate` 时已经根据 `prisma/schema.prisma` 为每一张表
 * 自动生成了对应的 TypeScript 类型，可直接从 `@prisma/client` 导入，例如：
 *
 *     import type { Candidate, Customer, Requirement } from '@prisma/client'
 *
 * 这些类型与数据库字段、Prisma 查询返回值完全一致，schema 改动后重新 generate
 * 即同步更新，无需也不应再手写实体类，否则容易与库表脱节。
 *
 * 【本文件的作用】
 * 1. 把常用模型类型集中再导出，页面里写 `from '@/types/models'` 即可，
 *    无需关心它们其实来自 `@prisma/client`（便于统一管理 / 将来替换）。
 * 2. Prisma 默认导出的模型类型「只含标量字段，不含关联对象」。当某个查询用
 *    `include` 把关联表一起查出来时，返回值会多出关联字段。这里为这类「带关联」
 *    的返回值预定义复合类型（XxxWithRelations），与各 API 路由里使用的
 *    `XXX_INCLUDE`（见 `src/lib/*Data.ts`）保持对应，页面接口数据可直接标注。
 *
 * 【用法示例】
 *     import type { CandidateWithRelations } from '@/types/models'
 *     const [rows, setRows] = useState<CandidateWithRelations[]>([])
 *
 * 注意：复合类型里的关联字段形状要与对应 `XXX_INCLUDE` 的 select 保持一致。
 * 若以后调整了某个 INCLUDE 的 select 字段，请同步修改这里的复合类型。
 */

import type {
  Candidate,
  CandidateGuaranteeCommunication,
  CandidateRiskEvent,
  Customer,
  CustomerOfficeAddress,
  ClientSupplement,
  SupplementDemandUpdate,
  SupplementCustomerProfile,
  Requirement,
  RequirementPositionProfile,
  RequirementUrgentRecord,
  Opportunity,
  OpportunityProgress,
  Contract,
  ContractInvoice,
  TalentPool,
  KnowledgeBase,
  KnowledgeManagementRecord,
  User,
  Role,
  Department,
  Permission,
  WorkPlan,
} from '@prisma/client'

// ── 标量模型类型（再导出，等价于直接 from '@prisma/client'）─────────────────────
export type {
  Candidate,
  CandidateGuaranteeCommunication,
  CandidateRiskEvent,
  Customer,
  CustomerOfficeAddress,
  ClientSupplement,
  SupplementDemandUpdate,
  SupplementCustomerProfile,
  Requirement,
  RequirementPositionProfile,
  RequirementUrgentRecord,
  Opportunity,
  OpportunityProgress,
  Contract,
  ContractInvoice,
  TalentPool,
  KnowledgeBase,
  KnowledgeManagementRecord,
  User,
  Role,
  Department,
  Permission,
  WorkPlan,
}

// ── 枚举类型（值 + 类型）─────────────────────────────────────────────────────────
// Prisma 同时把枚举导出为「值对象」和「同名类型」，需要时按值导入：
//   import { RecommendationStatus } from '@prisma/client'
export type {
  EducationLevel,
  SchoolTier,
  GenderType,
  RecommendationStatus,
  OpportunityStatus,
  OpportunityNature,
} from '@prisma/client'

// ── 关联子集（与 *Data.ts 中的 select 对应的精简对象）──────────────────────────
/** 仅含 id + 简称，对应各 INCLUDE 里 customer 的 select */
export type CustomerRef = Pick<Customer, 'id' | 'shortName'>
/** 仅含 id + 职位名，对应各 INCLUDE 里 requirement 的 select */
export type RequirementRef = Pick<Requirement, 'id' | 'positionName'>
/** 仅含 id + 姓名，对应各 INCLUDE 里 user 的 select（提交人/销售/交付/上传人）*/
export type UserRef = Pick<User, 'id' | 'name'>

// ── 复合类型：带关联的查询返回值 ────────────────────────────────────────────────

/**
 * 候选人详情（对应 src/lib/candidateData.ts -> CANDIDATE_INCLUDE）
 * customer/requirement/submitter 为精简对象，子表为完整记录数组。
 */
export type CandidateWithRelations = Candidate & {
  customer: CustomerRef | null
  requirement: RequirementRef | null
  submitter: UserRef | null
  guaranteeCommunications: CandidateGuaranteeCommunication[]
  riskEvents: CandidateRiskEvent[]
}

/**
 * 客户详情（对应 src/lib/clientData.ts -> CUSTOMER_INCLUDE）
 * 仅 include 了办公地址子表。
 */
export type CustomerWithRelations = Customer & {
  officeAddresses: CustomerOfficeAddress[]
}

/**
 * 客户补充信息详情（对应 src/lib/supplementData.ts -> SUPPLEMENT_INCLUDE）
 */
export type ClientSupplementWithRelations = ClientSupplement & {
  customer: CustomerRef | null
  demandUpdates: SupplementDemandUpdate[]
  customerProfiles: SupplementCustomerProfile[]
}

/**
 * 客户需求详情（对应 src/lib/requirementData.ts -> REQUIREMENT_INCLUDE）
 */
export type RequirementWithRelations = Requirement & {
  customer: CustomerRef | null
  positionProfiles: RequirementPositionProfile[]
  urgentRecords: RequirementUrgentRecord[]
}

/**
 * 商机详情（对应 src/lib/opportunityData.ts -> OPPORTUNITY_INCLUDE）
 */
export type OpportunityWithRelations = Opportunity & {
  salesOwner: UserRef | null
  progressRecords: OpportunityProgress[]
}

/**
 * 合同详情（对应 src/lib/contractData.ts -> CONTRACT_INCLUDE）
 */
export type ContractWithRelations = Contract & {
  customer: CustomerRef | null
  salesOwner: UserRef | null
  deliveryOwner: UserRef | null
  invoices: ContractInvoice[]
}

/** 知识库管理细则（含上传人精简对象）*/
export type KnowledgeManagementRecordWithSubmitter = KnowledgeManagementRecord & {
  submitter: UserRef | null
}

/**
 * 知识库详情（对应 src/lib/knowledgeData.ts -> KNOWLEDGE_INCLUDE）
 * 管理细则子表里进一步 include 了 submitter。
 */
export type KnowledgeBaseWithRelations = KnowledgeBase & {
  managementRecords: KnowledgeManagementRecordWithSubmitter[]
}

/** 用户详情（含部门 / 角色），用于用户管理页 */
export type UserWithRelations = User & {
  department: Department | null
  role: Role | null
}
