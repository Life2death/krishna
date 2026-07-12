import { getDatabase } from "./driver";

export type DeviceKind = "desktop" | "mobile";
export type DeviceCommandStatus = "pending" | "done" | "failed";

export interface DeviceCommand {
  id: string;
  source_kind: DeviceKind;
  target_kind: DeviceKind;
  command_text: string;
  status: DeviceCommandStatus;
  result: string | null;
  created_at: number;
  updated_at: number;
}

function newId(): string {
  return crypto.randomUUID();
}

/** Queue a command for the other device. Synced to it via the sync engine. */
export async function enqueueDeviceCommand(
  sourceKind: DeviceKind,
  targetKind: DeviceKind,
  commandText: string,
): Promise<DeviceCommand> {
  const now = Date.now();
  const cmd: DeviceCommand = {
    id: newId(),
    source_kind: sourceKind,
    target_kind: targetKind,
    command_text: commandText,
    status: "pending",
    result: null,
    created_at: now,
    updated_at: now,
  };
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO device_commands (id, source_kind, target_kind, command_text, status, result, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [cmd.id, cmd.source_kind, cmd.target_kind, cmd.command_text, cmd.status, cmd.result, cmd.created_at, cmd.updated_at],
  );
  return cmd;
}

/** Pending commands addressed to this device kind, oldest first. */
export async function getPendingDeviceCommands(
  myKind: DeviceKind,
  sinceMs: number,
): Promise<DeviceCommand[]> {
  const db = await getDatabase();
  return db.select<DeviceCommand[]>(
    `SELECT * FROM device_commands
     WHERE target_kind = ? AND status = 'pending' AND created_at >= ?
     ORDER BY created_at ASC`,
    [myKind, sinceMs],
  );
}

/** Mark a command executed (or failed) with its spoken result. */
export async function completeDeviceCommand(
  id: string,
  status: Exclude<DeviceCommandStatus, "pending">,
  result: string,
): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `UPDATE device_commands SET status = ?, result = ?, updated_at = ? WHERE id = ?`,
    [status, result, Date.now(), id],
  );
}
