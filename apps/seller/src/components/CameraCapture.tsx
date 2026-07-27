import { useEffect, useRef, useState } from 'react';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

// Cámara en vivo vía getUserMedia en vez de <input type="file" capture>: ese
// atributo es solo una sugerencia de UI (algunos navegadores/dispositivos
// igual ofrecen "elegir archivo" o galería junto con la cámara) — esto no
// deja ninguna otra fuente disponible, porque nunca existe un selector de
// archivos: solo un <video> en vivo y un botón que congela el frame actual.
export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Este dispositivo o navegador no permite acceder a la cámara.');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setReady(true);
      })
      .catch(() => setError('No se pudo acceder a la cámara. Revisa los permisos e intenta de nuevo.'));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capturar = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      onCapture(new File([blob], `visita-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.85);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 100, display: 'flex', flexDirection: 'column' }}>
      <button
        onClick={onClose}
        style={{ position: 'absolute', top: 16, right: 16, zIndex: 2, width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>

      {error ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: 24, textAlign: 'center' }}>
          <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{error}</span>
          <button onClick={onClose} style={{ background: '#fff', color: '#1a1f1c', border: 'none', borderRadius: 12, padding: '11px 20px', fontSize: 14, fontWeight: 700 }}>Cerrar</button>
        </div>
      ) : (
        <>
          <video ref={videoRef} autoPlay playsInline muted style={{ flex: 1, width: '100%', objectFit: 'cover' }} />
          <div style={{ padding: '22px 0 34px', display: 'flex', justifyContent: 'center', background: 'rgba(0,0,0,.35)' }}>
            <button
              onClick={capturar} disabled={!ready}
              aria-label="Tomar foto"
              style={{ width: 72, height: 72, borderRadius: '50%', border: '4px solid #fff', background: 'rgba(255,255,255,.25)', opacity: ready ? 1 : 0.5 }}
            />
          </div>
        </>
      )}
    </div>
  );
}
