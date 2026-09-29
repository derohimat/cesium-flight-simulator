import { useGameEvent } from '../../../hooks/useGameEvent';
import { useAddress } from '../../../hooks/useAddress';

/** Compact "where am I" line for free flight: the street / place below the vehicle. */
export function AddressChip() {
  const vehicle = useGameEvent('vehicleStateChanged', { throttle: 1000 });
  const address = useAddress(vehicle?.latitude ?? null, vehicle?.longitude ?? null);

  if (!address) return null;
  return (
    <div
      className="max-w-[360px] truncate px-3 py-1 rounded-full bg-black/45 border border-white/10
                 text-[11px] text-white/75"
      title={address.full}
    >
      📍 {address.short}
    </div>
  );
}
