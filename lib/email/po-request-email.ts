import { sendEmail } from './send-email'
import {
  buildPoRequestEmailHtml,
  poRequestEmailSubject,
  type PoRequestEmailContent,
} from './po-request-template'

export async function sendPoRequestEmail(
  to: string[],
  options: PoRequestEmailContent,
): Promise<void> {
  const [primaryTo, ...cc] = to
  const html = buildPoRequestEmailHtml(options)
  await sendEmail(primaryTo, poRequestEmailSubject(options), html, {
    cc: cc.length > 0 ? cc : undefined,
  })
}
