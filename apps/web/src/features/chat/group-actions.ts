import { createGroupSchema, type CreateGroupInput, type GroupConversationDto } from "@sala/contracts";
import { apiPost, ApiRequestError } from "@/lib/api";

/** POST /api/v1/groups: creates a group with the caller as owner. Throws ApiRequestError. */
export function createGroup(input: CreateGroupInput): Promise<GroupConversationDto> {
  return apiPost<GroupConversationDto>("/api/v1/groups", input, createGroupSchema);
}

/** POST /api/v1/groups/{id}/leave. Throws ApiRequestError. */
export async function leaveGroup(groupId: string): Promise<void> {
  await apiPost(`/api/v1/groups/${groupId}/leave`);
}

/** Spanish (voseo) copy for any failure of `createGroup` / `leaveGroup`. */
export function groupErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.code === "NOT_FOUND") return "Este grupo ya no existe o saliste de él.";
    if (err.code === "RESTRICTED") return "No podés hacer esto en este momento.";
    if (err.code === "BLOCKED") return "No podés agregar a una de las personas elegidas.";
    if (err.code === "DM_NOT_ALLOWED") return "Una de las personas elegidas no acepta mensajes directos.";
    if (err.code === "RATE_LIMITED") return "Hiciste muchas acciones seguidas. Probá de nuevo en un rato.";
    if (err.code === "FORBIDDEN") return "Solo quien creó el grupo puede agregar personas.";
    if (err.code === "VALIDATION_ERROR") return "Revisá el nombre y las personas elegidas. Un grupo puede tener hasta 20 personas.";
  }
  return "No pudimos completar la acción. Probá de nuevo.";
}
