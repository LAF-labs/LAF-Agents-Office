import type { BridgeDevice, ProjectLocalBinding } from "../../../api/client";

export function onlineBridgeDevices(devices: BridgeDevice[]): BridgeDevice[] {
  return devices.filter((device) => device.status === "online");
}

export function defaultProjectBinding(
  bindings: ProjectLocalBinding[],
  devices: BridgeDevice[],
): ProjectLocalBinding | null {
  const onlineIDs = new Set(
    onlineBridgeDevices(devices).map((device) => device.id),
  );
  return (
    bindings.find(
      (binding) => binding.trusted && onlineIDs.has(binding.device_id),
    ) ||
    bindings.find((binding) => binding.trusted) ||
    bindings[0] ||
    null
  );
}

export function bridgeDeviceForBinding(
  binding: ProjectLocalBinding | null,
  devices: BridgeDevice[],
): BridgeDevice | null {
  if (!binding) return null;
  return devices.find((device) => device.id === binding.device_id) || null;
}
