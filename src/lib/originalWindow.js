import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM, VirtualConsole } from 'jsdom'

const originalDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../ubiquitous-parakeet')

export function loadOriginalWindow() {
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', () => {})
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost/',
    virtualConsole,
  })

  const files = ['finance.js', 'client-management.js', 'car-management.js', 'driver-link.js', 'script.js']
  for (const file of files) {
    const script = dom.window.document.createElement('script')
    script.textContent = fs.readFileSync(path.join(originalDir, file), 'utf8')
    dom.window.document.body.appendChild(script)
  }
  return dom.window
}

export function applyOriginalFixture(win, settings, workDataByLogId) {
  win.localStorage.setItem('userSettings', JSON.stringify(settings))
  win.localStorage.setItem('workData', JSON.stringify(workDataByLogId.main || {}))
  Object.entries(workDataByLogId).forEach(([logId, data]) => {
    if (logId === 'main') return
    win.localStorage.setItem(`workData_${logId}`, JSON.stringify(data))
  })
}
