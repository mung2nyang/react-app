// 위도·경도 → 기상청 5km 격자 번호(기상청 단기예보 격자 변환식). 좌표는 휴대폰 밖으로 보내지 않는다.
export type KmaGrid = { nx: number, ny: number }

// 기상청 활용 가이드의 람베르트 정각 원추 도법 값.
const EARTH_KM = 6371.00877
const GRID_KM = 5
const STANDARD_LAT_1 = 30
const STANDARD_LAT_2 = 60
const ORIGIN_LON = 126
const ORIGIN_LAT = 38
const ORIGIN_X = 43
const ORIGIN_Y = 136
// 기상청 격자 크기(가로 149, 세로 253칸) — 밖이면 null.
const NX_MAX = 149
const NY_MAX = 253
const RAD = Math.PI / 180

const re = EARTH_KM / GRID_KM
const slat1 = STANDARD_LAT_1 * RAD
const slat2 = STANDARD_LAT_2 * RAD
const sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(Math.tan(Math.PI / 4 + slat2 / 2) / Math.tan(Math.PI / 4 + slat1 / 2))
const sf = (Math.tan(Math.PI / 4 + slat1 / 2) ** sn * Math.cos(slat1)) / sn
const ro = (re * sf) / Math.tan(Math.PI / 4 + (ORIGIN_LAT * RAD) / 2) ** sn

export function kmaGridOf(lat: number, lon: number): KmaGrid | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  const ra = (re * sf) / Math.tan(Math.PI / 4 + (lat * RAD) / 2) ** sn
  let theta = lon * RAD - ORIGIN_LON * RAD
  if (theta > Math.PI) theta -= 2 * Math.PI
  if (theta < -Math.PI) theta += 2 * Math.PI
  theta *= sn
  const nx = Math.floor(ra * Math.sin(theta) + ORIGIN_X + 0.5)
  const ny = Math.floor(ro - ra * Math.cos(theta) + ORIGIN_Y + 0.5)
  return nx >= 1 && nx <= NX_MAX && ny >= 1 && ny <= NY_MAX ? { nx, ny } : null
}
