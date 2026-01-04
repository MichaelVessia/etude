import { useState, useCallback, useEffect, useRef } from "react"
import { MidiStatusBadge } from "./MidiStatusBadge.js"
import type { UseMidiResult } from "../hooks/index.js"
import styles from "./MidiDeviceSelector.module.css"

interface MidiDeviceSelectorProps {
  midi: UseMidiResult
  onSelectDevice: (id: string | null) => void
}

export function MidiDeviceSelector({ midi, onSelectDevice }: MidiDeviceSelectorProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [showDropdown])

  const handleSelectDevice = useCallback(
    (id: string) => {
      onSelectDevice(id)
      setShowDropdown(false)
    },
    [onSelectDevice]
  )

  return (
    <div className={styles.container} ref={containerRef}>
      <MidiStatusBadge
        isConnected={midi.isConnected}
        deviceName={midi.selectedDevice?.name}
        onClick={() => setShowDropdown(!showDropdown)}
      />

      {showDropdown && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>Select MIDI Device</div>
          {midi.devices.length === 0 ? (
            <div className={styles.empty}>
              No MIDI devices found. Connect a keyboard and refresh.
            </div>
          ) : (
            <div className={styles.list}>
              {midi.devices.map((device) => (
                <button
                  key={device.id}
                  className={`${styles.item} ${midi.selectedDevice?.id === device.id ? styles.itemActive : ""}`}
                  onClick={() => handleSelectDevice(device.id)}
                >
                  <span className={styles.deviceName}>{device.name}</span>
                  {device.manufacturer && (
                    <span className={styles.deviceMfg}>{device.manufacturer}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
