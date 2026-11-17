import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const PWAInstallButton: React.FC<{ variant?: 'compact' | 'hero' }> = ({ variant = 'compact' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleTrigger = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleTrigger}
        className={
          variant === 'hero'
            ? 'inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer'
            : 'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 text-neutral-100 hover:bg-white/10 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer'
        }
      >
        <Download className="w-4 h-4 text-amber-400" />
        <span>Install App</span>
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0e1311] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Install MIX DJ – MUNIX AI</h3>
                  <p className="text-xs text-neutral-400">Progressive Web App for Mobile & Desktop</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 cursor-pointer"
                aria-label="Close install instructions"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isIOS ? (
              <ol className="mt-5 space-y-3 text-sm text-neutral-300 leading-relaxed">
                <li>1. Open this studio in <strong className="text-white">Safari</strong> on your iPhone or iPad.</li>
                <li>2. Tap the <strong className="text-white">Share</strong> button in the Safari toolbar.</li>
                <li>3. Scroll down and tap <strong className="text-emerald-400">Add to Home Screen</strong>.</li>
                <li>4. Launch <strong className="text-amber-300">MUNIX DJ</strong> from your home screen for full-screen studio mode.</li>
              </ol>
            ) : (
              <div className="mt-5 space-y-3 text-sm text-neutral-300 leading-relaxed">
                <p>
                  Install <strong className="text-white">MIX DJ – MUNIX AI</strong> directly onto your Android, Windows, or Mac device:
                </p>
                <ul className="space-y-2 text-neutral-300">
                  <li>• <strong className="text-white">Chrome / Edge (Desktop):</strong> Click the install icon in the address bar or open browser menu → <em>Install MIX DJ – MUNIX AI</em>.</li>
                  <li>• <strong className="text-white">Android Chrome:</strong> Tap the browser menu (⋮) → <em>Add to Home screen / Install app</em>.</li>
                </ul>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-6 w-full min-h-[44px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 z-40 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-[#171208] px-3 py-2 text-xs font-medium text-amber-200 shadow-lg">
      <WifiOff className="w-4 h-4 text-amber-400" />
      <span>Offline Mode — Local DJ Mixer & Cached Audio Active</span>
    </div>
  );
};
