import { expect, type Page } from '@playwright/test'

/** A `Date` as the ISO day the date fields take, read in the browser's local day. */
function isoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * En az bir hafta sonraki ilk Pazartesi'yi döndürür — ama yalnızca sunucu o günü iş günü sayıyorsa
 * (BR-4, BR-11). Tatil listesi sunucuda veridir; bu yüzden yardımcı takvimi tahmin etmez, oturum
 * açmış sayfaya `preview` sorusunu sorar. Tatil Pazartesi'si (ör. 2027-05-17, Kurban) dönerse
 * sözleşme 0 iş günü olur ve sunucu 400 verir; o yüzden birer hafta ilerleyip ilk çalışan
 * Pazartesi'de durur. Sayfa oturum açmış olmalıdır.
 *
 * Tek günlük aralık yeterlidir: iki spec de başlangıç gününü kapsayan bir aralık kurar, başlangıç
 * günü iş günüyse aralık en az bir iş günü içerir.
 */
async function nextBusinessMonday(page: Page): Promise<string> {
  const date = new Date()
  date.setDate(date.getDate() + 7)
  while (date.getDay() !== 1) {
    date.setDate(date.getDate() + 1)
  }

  // Sekiz hafta, tek bir resmî tatil haftasını (Ramazan/Kurban) rahatça aşar.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const day = isoDate(date)
    const answer = await page.evaluate(async (startDate) => {
      const response = await fetch(`/api/leave/preview?startDate=${startDate}&endDate=${startDate}`)
      return { status: response.status, body: (await response.json()) as { businessDays: number } }
    }, day)

    expect(answer.status, `preview "${day}" gününü yanıtladı`).toBe(200)
    if (answer.body.businessDays > 0) {
      return day
    }
    date.setDate(date.getDate() + 7)
  }

  throw new Error('sekiz hafta içinde iş günü olan bir Pazartesi bulunamadı')
}

export { nextBusinessMonday }
