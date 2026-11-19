import { useEffect, useRef } from 'react';

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

export const cameraScanSupported = (): boolean =>
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia &&
  'BarcodeDetector' in window;

/** Streams the rear camera into `videoRef` and reports each QR value (same code ignored for 3s). */
export function useCamera(active: boolean, onCode: (value: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handler = useRef(onCode);
  handler.current = onCode;

  useEffect(() => {
    if (!active || !cameraScanSupported()) return undefined;
    let stopped = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    const Detector = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
    const detector = new Detector({ formats: ['qr_code'] });
    let last = { value: '', at: 0 };

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(
      (s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        const video = videoRef.current;
        if (!video) return undefined;
        video.srcObject = s;
        void video.play();
        timer = setInterval(() => {
          void detector
            .detect(video)
            .then((found) => {
              const value = found[0]?.rawValue;
              if (value && (value !== last.value || Date.now() - last.at > 3000)) {
                last = { value, at: Date.now() };
                handler.current(value);
              }
            })
            .catch(() => undefined);
        }, 300);
        return undefined;
      },
      () => undefined,
    );
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active]);

  return videoRef;
}
