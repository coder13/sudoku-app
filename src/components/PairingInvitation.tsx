import { useMemo, useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import qrcode from 'qrcode-generator'
import { Button, IconButton } from './Button'

/** Show on the inviting device while its single-use pairing link is active. */
export function PairingInvitation({ link, expires, onClose }: { link: string; expires: number; onClose: () => void }) {
  const image = useMemo(() => {
    const code = qrcode(0, 'M')
    code.addData(link)
    code.make()
    return code.createDataURL(4)
  }, [link])
  const [copied, setCopied] = useState(false)
  const [manualCopy, setManualCopy] = useState(false)
  async function copyLink() {
    try { await navigator.clipboard.writeText(link); setCopied(true) }
    catch { setManualCopy(true) }
  }
  return <section className="sync-panel sync-invitation" aria-label="Pairing code">
    <div className="sync-panel-heading">
      <h2>Scan to link a device</h2>
      <IconButton variant="quiet" aria-label="Close pairing code" title="Close" onClick={onClose}><X size={18} /></IconButton>
    </div>
    <div className="sync-code-frame">
      <img className="sync-code" width="196" height="196" src={image} alt="QR code to link a device" />
    </div>
    <div className="sync-invitation-actions">
      <p>Expires at {new Date(expires).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
      <Button onClick={copyLink}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied' : 'Copy link'}</Button>
    </div>
    {manualCopy && <label>Pairing link<input readOnly autoFocus value={link} onFocus={event => event.target.select()} /></label>}
  </section>
}
