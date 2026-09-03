// @ts-check
/** @typedef {import('./outboxTypes.js').DriverRecord} DriverRecord */
/** @typedef {import('./outboxTypes.js').CarRecord} CarRecord */
/** @typedef {import('../domain/financeTypes.js').CarLike} CarLike */
import { upsertDriver } from './drivers.js'
import { requestDriverInviteSave } from './requestDriverInviteSave.js'

/**
 * @typedef {Object} CarInviteDraft
 * @property {'main'|'sub'} type
 * @property {string} number
 * @property {string} driverName
 * @property {string} driverPhone
 * @property {string} [inviteCode]
 * @property {string} [inviteStartDate]
 * @property {string|null} [inviteDriverId]
 */

/** @returns {string} */
export function todayIsoDate() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * After vehicle save: create/update driver invite via existing Fail-Fast path.
 * @param {Object} args
 * @param {boolean} args.cloud
 * @param {string} args.ownerKey
 * @param {string} args.userId
 * @param {Array<DriverRecord>} args.drivers
 * @param {Array<CarLike>} args.cars
 * @param {CarLike|null|undefined} args.saved
 * @param {CarInviteDraft} args.inviteDraft
 * @returns {Promise<string|null>} toast or error message; null if skipped
 */
export async function saveInviteAfterVehicle({
  cloud, ownerKey, userId, drivers, cars, saved, inviteDraft,
}) {
  if (!cloud || inviteDraft.type !== 'sub') return null
  const code = String(inviteDraft.inviteCode || '').replace(/\D/g, '')
  if (!/^\d{6}$/.test(code)) return null
  const vehicleNumber = saved?.number || inviteDraft.number
  if (!vehicleNumber) return null
  const startDate = inviteDraft.inviteStartDate || todayIsoDate()
  const result = upsertDriver(
    drivers,
    {
      name: inviteDraft.driverName,
      phone: inviteDraft.driverPhone,
      inviteCode: code,
      vehicleNumber,
      startDate,
      endDate: '',
    },
    /** @type {null|undefined} */ (inviteDraft.inviteDriverId || null),
    cars,
  )
  if (result.error) return result.error
  /** @type {Array<CarLike>} */
  let carsForInvite = cars
  if (saved?.id) {
    const idx = cars.findIndex((c) => c.id === saved.id)
    if (idx >= 0) {
      carsForInvite = cars.slice()
      carsForInvite[idx] = { ...cars[idx], ...saved }
    } else {
      carsForInvite = [...cars, saved]
    }
  }
  const saveResult = await requestDriverInviteSave({
    ownerKey,
    userId,
    items: result.items,
    editingId: inviteDraft.inviteDriverId ?? null,
    cars: /** @type {Array<CarRecord>} */ (carsForInvite),
    previousItems: drivers,
  })
  if (saveResult.blocked) return saveResult.blocked
  return saveResult.toast || null
}