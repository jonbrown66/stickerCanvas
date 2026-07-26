"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

interface CameraCaptureProps {
  onClose: () => void;
  onCapture: (file: File) => void;
  onFallback: () => void;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Capture failed"))),
      "image/jpeg",
      0.92,
    );
  });
}

export function CameraCapture({
  onClose,
  onCapture,
  onFallback,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment",
  );
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    let disposed = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      queueMicrotask(() => setError("Camera unavailable"));
      return;
    }

    void mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      .then((stream) => {
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      })
      .catch((reason: unknown) => {
        const name =
          reason instanceof DOMException ? reason.name : "UnknownError";
        if (name === "NotAllowedError") {
          setError("Camera permission was denied");
        } else if (name === "NotFoundError") {
          setError("No camera was found");
        } else if (name === "NotReadableError") {
          setError("Camera is already in use");
        } else {
          setError("Camera unavailable");
        }
      });

    return () => {
      disposed = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [facingMode]);

  const capture = async () => {
    if (capturing) return;
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) return;

    setCapturing(true);
    setError("");
    try {
      const maximumSide = 2048;
      const scale = Math.min(
        1,
        maximumSide / Math.max(video.videoWidth, video.videoHeight),
      );
      const width = Math.max(1, Math.round(video.videoWidth * scale));
      const height = Math.max(1, Math.round(video.videoHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Capture unavailable");
      if (facingMode === "user") {
        context.translate(width, 0);
        context.scale(-1, 1);
      }
      context.drawImage(video, 0, 0, width, height);
      const blob = await canvasToBlob(canvas);
      canvas.width = 1;
      canvas.height = 1;
      onCapture(
        new File([blob], `sticker-${Date.now()}.jpg`, { type: "image/jpeg" }),
      );
    } catch {
      setError("Photo capture failed");
      setCapturing(false);
    }
  };

  return (
    <section
      ref={dialogRef}
      className="simple-camera"
      role="dialog"
      aria-modal="true"
      aria-label="Camera"
      data-canvas-ui
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
        if (event.key !== "Tab") return;
        const focusable = [
          ...(dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ) ?? []),
        ];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        onCanPlay={() => setReady(true)}
      />
      <div className="simple-camera-shade" />
      <button
        ref={closeButtonRef}
        className="simple-camera-close"
        type="button"
        aria-label="Close camera"
        onClick={onClose}
      >
        <Icon name="close" />
      </button>
      {error ? (
        <div className="simple-camera-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={onFallback}>
            Open camera
          </button>
        </div>
      ) : null}
      <div className="simple-camera-actions">
        <button
          className="simple-camera-switch"
          type="button"
          onClick={() => {
            setReady(false);
            setError("");
            setFacingMode((current) =>
              current === "environment" ? "user" : "environment",
            );
          }}
        >
          Flip
        </button>
        <button
          className="simple-camera-shutter"
          type="button"
          disabled={!ready || capturing}
          aria-label="Take photo"
          onClick={() => void capture()}
        >
          <span />
        </button>
        <span className="simple-camera-spacer" />
      </div>
    </section>
  );
}
