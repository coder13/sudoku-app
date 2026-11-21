import { useEffect, useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { createShareQrImage, SHARE_QR_WIDTH } from '../sudoku/share-qr'
import { Button, IconButton } from './Button'

/** Show on the inviting device while its single-use pairing link is active. */
export function PairingInvitation({ link, expires, onClose }: { link: string; expires: number; onClose: () => void }) {
  const [qr, setQr] = useState<{ link: string; image?: string }>()
  useEffect(() => {
    let active = true
    void createShareQrImage(link).then(
      image => { if (active) setQr({ link, image }) },
      () => { if (active) setQr({ link }) },
    )
    return () => { active = false }
  }, [link])
  const [copied, setCopied] = useState(false)
  const [manualCopy, setManualCopy] = useState(false)
  async function copyLink() {
    try { await navigator.clipboard.writeText(link); setCopied(true) }
    catch { setManualCopy(true) }
  }
  return <section className="sync-panel sync-invitation" aria-label="Pairing code">
    <div className="sync-panel-heading">
      <h3>Scan to link a device</h3>
      <IconButton variant="quiet" aria-label="Close pairing code" title="Close" onClick={onClose}><X size={18} /></IconButton>
    </div>
    {qr?.link !== link || qr.image ? <div className="sync-code-frame" style={{ maxWidth: SHARE_QR_WIDTH }} aria-busy={qr?.link !== link}>
      {qr?.link === link && qr.image && <img className="sync-code" width={SHARE_QR_WIDTH} height={SHARE_QR_WIDTH}
        src={qr.image} alt="QR code to link a device" />}
    </div> : <p role="status">QR code unavailable. Use the pairing link to connect.</p>}
    <div className="sync-invitation-actions">
      <p>Expires at {new Date(expires).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
      <Button onClick={copyLink}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied' : 'Copy link'}</Button>
    </div>
    {manualCopy && <label>Pairing link<input readOnly autoFocus value={link} onFocus={event => event.target.select()} /></label>}
  </section>
}
