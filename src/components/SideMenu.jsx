// @ts-check
// 사이드메뉴 구성·동작. 아이콘 그림은 side-menu/SideMenuIcons.jsx.
import { assetPath } from '../lib/assetPath.js'
import { CarIcon, PeopleIcon, PersonIcon, GearIcon, FuelIcon, ChartIcon, DocIcon, TruckIcon, SupportIcon } from './side-menu/SideMenuIcons.jsx'

const BANNER_LIGHT = assetPath('/images/banner_image_Light.png')
const BANNER_DARK = assetPath('/images/banner_image_dark.png')

/** 지금 테마의 배너 하나만(숨긴 그림도 내려받음, 10-A) */
export function sideMenuBannerSrc() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? BANNER_DARK : BANNER_LIGHT
}

/** 메뉴를 처음 열 때 그림 칸이 비지 않게 앱이 뜬 뒤 미리 받아 둔다(로드맵 15번). */
export function preloadSideMenuBanner() {
  const img = document.createElement('img')
  img.src = sideMenuBannerSrc()
  return img
}

/**
 * @typedef {{ number: string, label: string, driverName: string }} SubLogMenuItem
 * @typedef {{ linkId: string, driverName: string }} LinkedDriverMenuItem
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {(page: string, title?: string) => void} props.onSelect
 * @param {Array<LinkedDriverMenuItem>} [props.linkedDriverItems]
 * @param {(linkId: string) => void} [props.onOpenLinkedDriver]
 * @param {Array<SubLogMenuItem>} [props.subLogItems]
 * @param {(vehicleNumber: string) => void} [props.onOpenSubLog]
 */
export default function SideMenu({
  open, onClose, onSelect,
  linkedDriverItems = [], onOpenLinkedDriver,
  subLogItems = [], onOpenSubLog,
}) {
  if (!open) return null
  const banner = sideMenuBannerSrc()

  /** @param {string} page @param {string} [title] */
  function pick(page, title) {
    onSelect(page, title)
    onClose()
  }

  /** @param {string} vehicleNumber */
  function openSubLog(vehicleNumber) {
    onOpenSubLog?.(vehicleNumber)
    onClose()
  }

  /** @param {string} linkId */
  function openLinkedDriver(linkId) {
    onOpenLinkedDriver?.(linkId)
    onClose()
  }

  return (
    <>
      <div className="side-menu-overlay show" onClick={onClose}></div>
      <aside className="side-menu open" aria-label="메뉴">
        <div className="side-menu-header">
          <div className="menu-banner-wrap">
            <img src={banner} alt="운행일지" className="menu-banner" />
          </div>
        </div>
        <div className="side-menu-sections">
          <section className="side-menu-section management-section">
            <h3 className="side-menu-section-title">관리</h3>
            <button type="button" className="dropdown-item" onClick={() => pick('cars')}>
              <CarIcon />
              차량 관리
            </button>
            <button type="button" className="dropdown-item" onClick={() => pick('expenses')}>
              <FuelIcon />
              차량 유지비
            </button>
            {linkedDriverItems.map((item) => (
              <button
                key={item.linkId}
                type="button"
                className="dropdown-item"
                title={`${item.driverName} 기사 관리`}
                onClick={() => openLinkedDriver(item.linkId)}
              >
                <PeopleIcon />
                {item.driverName} 기사 관리
              </button>
            ))}
            {subLogItems.map((item) => (
              <button
                key={item.number}
                type="button"
                className="dropdown-item"
                title={`${item.driverName || item.label} 기사 관리`}
                onClick={() => openSubLog(item.number)}
              >
                <TruckIcon />
                {item.driverName || item.label} 기사 관리
              </button>
            ))}
          </section>
          <section className="side-menu-section business-section">
            <h3 className="side-menu-section-title">경영</h3>
            <button type="button" className="dropdown-item" onClick={() => pick('clients')}>
              <PeopleIcon />
              거래처
            </button>
            <button type="button" className="dropdown-item" onClick={() => pick('receivables')}>
              <ChartIcon />
              미수금/정산 관리
            </button>
            <button type="button" className="dropdown-item" onClick={() => pick('report')}>
              <DocIcon />
              서류 발급
            </button>
          </section>
          <section className="side-menu-section settings-section">
            <h3 className="side-menu-section-title">설정</h3>
            <button type="button" className="dropdown-item" onClick={() => pick('profile')}>
              <PersonIcon />
              개인정보
            </button>
            <button type="button" className="dropdown-item" onClick={() => pick('settings')}>
              <GearIcon />
              앱 설정
            </button>
            <button type="button" className="dropdown-item" onClick={() => pick('support')}>
              <SupportIcon />
              고객센터
            </button>
          </section>
        </div>
      </aside>
    </>
  )
}
