import React, { useEffect, useState } from 'react';
import { isOnline, subscribeConnectivity, backgroundSync } from '../services/offlineSyncService';

// PUBLIC_INTERFACE
export default function ConnectivityStatus() {
  /** Displays connectivity status and triggers background sync on reconnect. */
  const [online, setOnline] = useState(isOnline());
  const [lastSync, setLastSync] = useState(null);

  useEffect(() => {
    const unsub = subscribeConnectivity(async ({ online: on }) => {
      setOnline(on);
      if (on) {
        const res = await backgroundSync();
        if (res?.merged) {
          setLastSync(new Date().toISOString());
        }
      }
    });
    return () => unsub && unsub();
  }, []);

  return (
    <span
      className={`status-badge ${online ? 'online' : 'offline'}`}
      role="status"
      aria-live="polite"
      style={{ marginLeft: 8 }}
      title={online ? (lastSync ? `Online • Last sync ${new Date(lastSync).toLocaleTimeString()}` : 'Online') : 'Offline mode'}
    >
      {online ? 'Online' : 'Offline'}
      {lastSync && online ? ` • ${new Date(lastSync).toLocaleTimeString()}` : ''}
    </span>
  );
}
