import React, { useState } from 'react';
import { ArrowUpCircle, CheckCircle2, RefreshCw, X } from 'lucide-react';
import { downloadAndApplyUpdate, UpdateCheckResult } from '../utils/tauriBridge';

interface UpdateToastProps {
  updateInfo: UpdateCheckResult | null;
  manualCheckTriggered: boolean;
  onDismiss: () => void;
}

export const UpdateToast: React.FC<UpdateToastProps> = ({
  updateInfo,
  manualCheckTriggered,
  onDismiss,
}) => {
  const [updating, setUpdating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!updateInfo) return null;
  if (!updateInfo.update_available && !manualCheckTriggered) return null;

  const handleApplyUpdate = async () => {
    setUpdating(true);
    setStatusMessage('Téléchargement et application du patch...');
    try {
      const url = updateInfo.download_url || updateInfo.html_url;
      await downloadAndApplyUpdate(url);
      setStatusMessage('Mise à jour prête ! Relance en cours...');
    } catch (err) {
      setStatusMessage(
        `Erreur : ${err instanceof Error ? err.message : String(err)}`
      );
      setUpdating(false);
    }
  };

  return (
    <div className="no-print no-export cursiv-popup-anim fixed bottom-12 left-5 z-50 max-w-sm">
      <div
        className="cursiv-glass-toolbar p-3.5 rounded-xl shadow-xl border text-xs space-y-2"
        style={{
          borderColor: 'var(--border-color)',
          color: 'var(--text-color)',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold">
            {updateInfo.update_available ? (
              <>
                <ArrowUpCircle
                  className="w-4 h-4 shrink-0"
                  style={{ color: 'var(--primary-color)' }}
                />
                <span>
                  Nouvelle version Cursiv v{updateInfo.latest_version} disponible
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                <span>Cursiv v{updateInfo.current_version} est à jour</span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="p-0.5 rounded hover:bg-black/10 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <p
          className="m-0 text-[11px] leading-relaxed"
          style={{ color: 'var(--meta-content-color)' }}
        >
          {updateInfo.release_notes}
          {updateInfo.latest_commit_sha && (
            <span className="block font-mono mt-0.5 opacity-75">
              branche main : #{updateInfo.latest_commit_sha.slice(0, 7)}
            </span>
          )}
        </p>

        {statusMessage && (
          <div className="text-[11px] font-medium" style={{ color: 'var(--primary-color)' }}>
            {statusMessage}
          </div>
        )}

        {updateInfo.update_available && (
          <div className="pt-1 flex justify-end">
            <button
              type="button"
              disabled={updating}
              onClick={handleApplyUpdate}
              style={{ backgroundColor: 'var(--primary-color)' }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white font-medium hover:opacity-90 transition-opacity cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${updating ? 'animate-spin' : ''}`} />
              <span>Mettre à jour et relancer</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
