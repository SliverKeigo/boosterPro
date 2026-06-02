/**
 * 港澳台 / 海外补充行政区划数据。
 *
 * pca.json（china-division）只含大陆 31 个省级单位，缺香港、澳门、台湾及海外。
 * 这里把它们补成顶级「省」节点，追加到大陆各省之后，供 RegionCascade 合并成完整的级联树。
 *
 * 每个节点形如 { label, children? }：顶级是省级单位，children 为其下一级（区 / 县市 / 国家地区），均为叶子。
 */

export type RegionNode = { label: string; children?: RegionNode[] }

// 香港 18 区
const HK_DISTRICTS = [
  '中西区', '湾仔区', '东区', '南区', '油尖旺区', '深水埗区',
  '九龙城区', '黄大仙区', '观塘区', '葵青区', '荃湾区', '屯门区',
  '元朗区', '北区', '大埔区', '沙田区', '西贡区', '离岛区',
]

// 澳门
const MACAO_AREAS = ['澳门半岛', '氹仔', '路环']

// 台湾省 县/市
const TAIWAN_AREAS = [
  '台北市', '新北市', '桃园市', '台中市', '台南市', '高雄市',
  '基隆市', '新竹市', '嘉义市', '新竹县', '苗栗县', '彰化县',
  '南投县', '云林县', '嘉义县', '屏东县', '宜兰县', '花莲县',
  '台东县', '澎湖县', '金门县', '连江县',
]

const toLeaves = (labels: string[]): RegionNode[] => labels.map((label) => ({ label }))

/**
 * 追加到大陆各省之后的顶级节点：香港 / 澳门 / 台湾 / 海外。
 */
export const extraRegions: RegionNode[] = [
  { label: '香港特别行政区', children: toLeaves(HK_DISTRICTS) },
  { label: '澳门特别行政区', children: toLeaves(MACAO_AREAS) },
  { label: '台湾省', children: toLeaves(TAIWAN_AREAS) },
  // 海外：单层叶子，直接选「海外」即可，不再展开国家/地区
  { label: '海外' },
]
