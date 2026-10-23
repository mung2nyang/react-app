// 미수금 문자 되묻기 — 빠진 것만 차례로 묻고, 다 고르면 문자 앱을 연다.
import { useState } from 'react'
import { useSession } from '../../../data/cloud/sessionContext.ts'
import { MESSAGE_TEMPLATE_TITLES } from '../../../data/sync/messageTemplates.ts'
import { todayWorkLogSelection } from '../../../domain/calendar.ts'
import { formatWon } from '../../../domain/money.ts'
import { buildSmsHref } from '../../../domain/smsHref.ts'
import { itemKey, itemLabel, monthLabel, pickedItems, readSmsItems, smsBody, smsClientItems, smsClientTotals, smsPhone, smsTotal } from '../api/unbiseoSms.ts'
import type { SmsPick, UnbiseoSms } from '../api/unbiseoSms.ts'
import { withParticle } from '../api/unbiseoSentence.ts'
import './unbiseo-sms.css'

type Props = { sms: UnbiseoSms }

const amountOf = (count: number, total: number) => `${count}건, ${formatWon(total)}`

export default function UnbiseoSmsSteps({ sms }: Props) {
  const { ownerKey } = useSession()
  const [today] = useState(() => todayWorkLogSelection(new Date()).dateKey)
  // 답을 받은 그 순간 값으로만 — 화면 안에서만 들고 있다.
  const [items] = useState(() => readSmsItems(ownerKey))
  const [client, setClient] = useState(sms.client)
  const [chosenPick, setChosenPick] = useState<SmsPick | null>(null)
  const [choosing, setChoosing] = useState<Array<string> | null>(null)
  const [template, setTemplate] = useState(sms.template)
  const done: Array<string> = []

  if (!client) {
    const totals = smsClientTotals(items)
    if (!totals.length) return <p className="home-assistant-note">남은 미수금이 없어요.</p>
    return (
      <div className="unbiseo-sms-step">
        <p className="home-assistant-note">어느 거래처에 보낼까요?</p>
        {totals.map((row) => (
          <button key={row.client} type="button" className="unbiseo-sms-choice" onClick={() => setClient(row.client)}>{`${row.client}(${amountOf(row.count, row.total)})`}</button>
        ))}
      </div>
    )
  }

  const { list, months } = smsClientItems(items, client)
  if (!list.length) return <p className="home-assistant-note">{`${withParticle(client, '은', '는')} 남은 미수금이 없어요.`}</p>
  done.push(`${client}(${amountOf(list.length, smsTotal(list))})`)
  // 말한 달·전체는 바로 고른다 — 그 달에 남은 게 없으면 알리고 묻는다.
  const saidMonth = sms.month && months.some((group) => group.monthKey === sms.month) ? sms.month : ''
  const pick: SmsPick | null = chosenPick ?? (saidMonth ? { kind: 'month', month: saidMonth } : sms.all ? { kind: 'all' } : null)

  if (!pick && choosing) {
    return (
      <div className="unbiseo-sms-step">
        <p className="home-assistant-note">{done.join(' · ')}</p>
        <p className="home-assistant-note">보낼 건을 골라 주세요.</p>
        {list.map((item) => {
          const key = itemKey(item)
          return (
            <label key={key} className="unbiseo-sms-check">
              <input type="checkbox" checked={choosing.includes(key)} onChange={(event) => setChoosing(event.target.checked ? [...choosing, key] : choosing.filter((one) => one !== key))} />
              <span>{`${itemLabel(item)} ${formatWon(item.remainingAmount)}`}</span>
            </label>
          )
        })}
        <button type="button" className="home-assistant-action" disabled={!choosing.length} onClick={() => setChosenPick({ kind: 'items', keys: choosing })}>다음</button>
      </div>
    )
  }

  if (!pick) {
    return (
      <div className="unbiseo-sms-step">
        <p className="home-assistant-note">{done.join(' · ')}</p>
        {sms.month && !saidMonth && <p className="home-assistant-note">{`${monthLabel(sms.month, today)}은 남은 미수금이 없어요.`}</p>}
        <p className="home-assistant-note">어떤 건으로 문자를 보낼까요?</p>
        {months.map((group) => (
          <button key={group.monthKey} type="button" className="unbiseo-sms-choice" onClick={() => setChosenPick({ kind: 'month', month: group.monthKey })}>{`${monthLabel(group.monthKey, today)} 전체(${amountOf(group.count, group.total)})`}</button>
        ))}
        {months.length > 1 && <button type="button" className="unbiseo-sms-choice" onClick={() => setChosenPick({ kind: 'all' })}>{`남은 전체(${amountOf(list.length, smsTotal(list))})`}</button>}
        <button type="button" className="unbiseo-sms-choice" onClick={() => setChoosing([])}>직접 고르기</button>
      </div>
    )
  }

  const picked = pickedItems(list, pick)
  done.push(pick.kind === 'month' ? `${monthLabel(pick.month, today)} 전체(${amountOf(picked.length, smsTotal(picked))})` : pick.kind === 'all' ? `남은 전체(${amountOf(picked.length, smsTotal(picked))})` : `직접 고름(${amountOf(picked.length, smsTotal(picked))})`)

  if (!template) {
    return (
      <div className="unbiseo-sms-step">
        <p className="home-assistant-note">{done.join(' · ')}</p>
        <p className="home-assistant-note">어떤 문구로 보낼까요?</p>
        {MESSAGE_TEMPLATE_TITLES.map((title, index) => (
          <button key={title} type="button" className="unbiseo-sms-choice" onClick={() => setTemplate(index === 0 ? 1 : index === 1 ? 2 : 3)}>{title}</button>
        ))}
      </div>
    )
  }

  done.push(MESSAGE_TEMPLATE_TITLES[template - 1])
  const phone = smsPhone(ownerKey, client)
  const body = smsBody(template, client, pick, picked, today)
  return (
    <div className="unbiseo-sms-step">
      <p className="home-assistant-note">{done.join(' · ')}</p>
      {phone ? (
        <>
          <p className="home-assistant-note">{`${client}(${phone})에 이 문구로 보낼게요.`}</p>
          <p className="unbiseo-sms-body">{body}</p>
          {/* 일지 문자 창과 같은 주소 — 누르면 휴대폰 문자 앱이 연락처·문구가 채워진 채 열린다. */}
          <a className="home-assistant-action unbiseo-sms-open" href={buildSmsHref(phone, body, navigator.userAgent)}>문자 열기</a>
        </>
      ) : (
        <p className="home-assistant-note">{`${client}에 등록된 연락처가 없어요. 거래처 화면에서 넣어 주세요.`}</p>
      )}
    </div>
  )
}
