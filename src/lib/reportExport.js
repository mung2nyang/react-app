// @ts-check

/**
 * @param {HTMLElement} element
 * @returns {Promise<HTMLCanvasElement>}
 */
async function renderReportCanvas(element) {
  const mod = await import('html2pdf.js')
  const html2pdf = mod.default
  const worker = html2pdf().set({
    html2canvas: {
      scale: 2,
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      backgroundColor: '#ffffff',
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    },
  }).from(element).toCanvas()
  return /** @type {HTMLCanvasElement} */ (await worker.get('canvas'))
}

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<Blob>}
 */
function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG 이미지 생성 실패'))), 'image/png')
  })
}

/**
 * @param {HTMLElement} element
 * @param {string} baseName 확장자 없는 파일명
 * @returns {Promise<File>}
 */
export async function createReportImageFile(element, baseName) {
  const canvas = await renderReportCanvas(element)
  const blob = await canvasToPngBlob(canvas)
  return new File([blob], `${baseName}.png`, { type: 'image/png' })
}

/**
 * @param {HTMLElement} element
 * @param {string} baseName
 * @returns {Promise<File>}
 */
export async function createReportPdfFile(element, baseName) {
  const mod = await import('html2pdf.js')
  const html2pdf = mod.default
  /** @type {Parameters<InstanceType<(typeof html2pdf)['Worker']>['set']>[0]} */
  const opt = {
    margin: [12, 10, 12, 10],
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false, scrollX: 0, scrollY: 0, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  }
  const blob = /** @type {Blob} */ (await html2pdf().set(opt).from(element).outputPdf('blob'))
  return new File([blob], `${baseName}.pdf`, { type: 'application/pdf' })
}
