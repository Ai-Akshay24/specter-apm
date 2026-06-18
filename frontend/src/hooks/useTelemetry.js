import { useState, useEffect, useRef } from 'react';

export default function useTelemetry(socket) {
  const [telemetry, setTelemetry] = useState({});
  const historyRef = useRef({});

  useEffect(() => {
    if (!socket) return;

    const handleTelemetryBatch = (batch) => {
      setTelemetry((prev) => {
        const updated = { ...prev };

        batch.servers.forEach((serverPayload) => {
          const { serverId } = serverPayload;

          if (!historyRef.current[serverId]) {
            historyRef.current[serverId] = [];
          }
          
          if (historyRef.current[serverId].length >= 60) {
            historyRef.current[serverId].shift();
          }
          
          historyRef.current[serverId].push(serverPayload);

          updated[serverId] = {
            ...serverPayload,
            _history: historyRef.current[serverId]
          };
        });

        return updated;
      });
    };

    socket.on('telemetry:batch', handleTelemetryBatch);

    return () => {
      socket.off('telemetry:batch', handleTelemetryBatch);
    };
  }, [socket]);

  return telemetry;
}